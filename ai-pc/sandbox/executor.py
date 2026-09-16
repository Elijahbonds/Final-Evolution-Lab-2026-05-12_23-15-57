"""Tool server. The only process in the stack that executes what a model chose.

Everything here runs as an unprivileged user inside a container with no
published ports. The agent reaches it over the private compose network.

Every filesystem path from the caller is resolved and checked against
WORKSPACE_ROOT before it is touched. That check is the containment boundary:
if it is wrong, nothing else in the stack saves us.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import time
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

WORKSPACE_ROOT = Path(os.environ.get("WORKSPACE_ROOT", "/workspace")).resolve()
BASH_TIMEOUT = float(os.environ.get("BASH_TIMEOUT_SECONDS", "120"))
BROWSE_TIMEOUT = float(os.environ.get("BROWSE_TIMEOUT_SECONDS", "45"))
MAX_OUTPUT_CHARS = int(os.environ.get("MAX_OUTPUT_CHARS", "20000"))

app = FastAPI(title="ai-pc sandbox", docs_url=None, redoc_url=None)


# ---------------------------------------------------------------- path safety

def resolve_in_workspace(raw: str, *, must_exist: bool = False) -> Path:
    """Resolve `raw` and refuse anything that lands outside the workspace.

    strict=False so we can resolve paths that do not exist yet (a write
    target). Symlinks are followed *before* the containment check, so a
    symlink inside the workspace pointing at /etc is caught here.
    """
    candidate = Path(raw)
    if not candidate.is_absolute():
        candidate = WORKSPACE_ROOT / candidate
    resolved = candidate.resolve(strict=False)

    if resolved != WORKSPACE_ROOT and WORKSPACE_ROOT not in resolved.parents:
        raise HTTPException(
            status_code=400,
            detail=f"path escapes workspace: {raw!r} -> {resolved}",
        )
    if must_exist and not resolved.exists():
        raise HTTPException(status_code=404, detail=f"no such path: {raw}")
    return resolved


def clip(text: str) -> tuple[str, bool]:
    """Cap output so one `find /` cannot blow out the model's context."""
    if len(text) <= MAX_OUTPUT_CHARS:
        return text, False
    head = MAX_OUTPUT_CHARS // 2
    tail = MAX_OUTPUT_CHARS - head
    return f"{text[:head]}\n\n...[{len(text) - MAX_OUTPUT_CHARS} chars elided]...\n\n{text[-tail:]}", True


# -------------------------------------------------------------------- schemas

class BashRequest(BaseModel):
    command: str
    cwd: str | None = None
    timeout: float | None = None


class BashResponse(BaseModel):
    stdout: str
    stderr: str
    exit_code: int
    duration_s: float
    truncated: bool = False
    timed_out: bool = False


class BrowseRequest(BaseModel):
    url: str
    wait_for: str | None = None
    screenshot_path: str | None = None
    full_page: bool = False


class BrowseResponse(BaseModel):
    url: str
    title: str
    text: str
    status: int | None = None
    screenshot: str | None = None
    truncated: bool = False


class FileReadRequest(BaseModel):
    path: str
    max_bytes: int = Field(default=200_000, ge=1, le=5_000_000)


class FileWriteRequest(BaseModel):
    path: str
    content: str
    mode: Literal["write", "append"] = "write"


class FileListRequest(BaseModel):
    path: str = "."
    depth: int = Field(default=2, ge=1, le=6)


# --------------------------------------------------------------------- routes

@app.get("/health")
async def health() -> dict[str, Any]:
    usage = shutil.disk_usage(WORKSPACE_ROOT)
    return {
        "ok": True,
        "workspace": str(WORKSPACE_ROOT),
        "disk_total_gb": round(usage.total / 1e9, 2),
        "disk_free_gb": round(usage.free / 1e9, 2),
        "limits": {
            "bash_timeout_s": BASH_TIMEOUT,
            "browse_timeout_s": BROWSE_TIMEOUT,
            "max_output_chars": MAX_OUTPUT_CHARS,
        },
    }


@app.post("/bash", response_model=BashResponse)
async def bash(req: BashRequest) -> BashResponse:
    cwd = resolve_in_workspace(req.cwd, must_exist=True) if req.cwd else WORKSPACE_ROOT
    cwd.mkdir(parents=True, exist_ok=True)
    timeout = min(req.timeout or BASH_TIMEOUT, BASH_TIMEOUT * 4)

    started = time.monotonic()
    proc = await asyncio.create_subprocess_shell(
        req.command,
        cwd=str(cwd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env={**os.environ, "HOME": str(WORKSPACE_ROOT)},
    )
    timed_out = False
    try:
        raw_out, raw_err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        timed_out = True
        proc.kill()
        raw_out, raw_err = await proc.communicate()

    stdout, t1 = clip(raw_out.decode("utf-8", "replace"))
    stderr, t2 = clip(raw_err.decode("utf-8", "replace"))
    return BashResponse(
        stdout=stdout,
        stderr=stderr,
        exit_code=-1 if timed_out else (proc.returncode or 0),
        duration_s=round(time.monotonic() - started, 3),
        truncated=t1 or t2,
        timed_out=timed_out,
    )


@app.post("/browse", response_model=BrowseResponse)
async def browse(req: BrowseRequest) -> BrowseResponse:
    from playwright.async_api import async_playwright

    shot_path = resolve_in_workspace(req.screenshot_path) if req.screenshot_path else None
    if shot_path:
        shot_path.parent.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            page = await browser.new_page(viewport={"width": 1440, "height": 900})
            response = await page.goto(
                req.url, timeout=BROWSE_TIMEOUT * 1000, wait_until="domcontentloaded"
            )
            if req.wait_for:
                await page.wait_for_selector(req.wait_for, timeout=BROWSE_TIMEOUT * 1000)
            title = await page.title()
            body = await page.inner_text("body")
            if shot_path:
                await page.screenshot(path=str(shot_path), full_page=req.full_page)
            text, truncated = clip(body)
            return BrowseResponse(
                url=page.url,
                title=title,
                text=text,
                status=response.status if response else None,
                screenshot=str(shot_path) if shot_path else None,
                truncated=truncated,
            )
        finally:
            await browser.close()


@app.post("/file/read")
async def file_read(req: FileReadRequest) -> dict[str, Any]:
    path = resolve_in_workspace(req.path, must_exist=True)
    if path.is_dir():
        raise HTTPException(status_code=400, detail=f"{req.path} is a directory")
    raw = path.read_bytes()[: req.max_bytes]
    return {
        "path": str(path),
        "content": raw.decode("utf-8", "replace"),
        "bytes": path.stat().st_size,
        "truncated": path.stat().st_size > req.max_bytes,
    }


@app.post("/file/write")
async def file_write(req: FileWriteRequest) -> dict[str, Any]:
    path = resolve_in_workspace(req.path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a" if req.mode == "append" else "w", encoding="utf-8") as fh:
        fh.write(req.content)
    return {"path": str(path), "bytes": path.stat().st_size, "mode": req.mode}


@app.post("/file/list")
async def file_list(req: FileListRequest) -> dict[str, Any]:
    root = resolve_in_workspace(req.path, must_exist=True)
    if root.is_file():
        return {"root": str(root), "entries": [{"path": root.name, "type": "file",
                                                "bytes": root.stat().st_size}]}
    entries: list[dict[str, Any]] = []
    for child in sorted(root.rglob("*")):
        rel = child.relative_to(root)
        if len(rel.parts) > req.depth:
            continue
        if any(part in {".git", "node_modules", "__pycache__"} for part in rel.parts):
            continue
        entries.append({
            "path": str(rel),
            "type": "dir" if child.is_dir() else "file",
            "bytes": child.stat().st_size if child.is_file() else None,
        })
        if len(entries) >= 2000:
            break
    return {"root": str(root), "entries": entries, "count": len(entries)}
