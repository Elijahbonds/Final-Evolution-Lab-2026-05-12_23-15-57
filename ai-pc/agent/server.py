"""HTTP API and web console for the agent.

Bearer auth on everything except /health and the console shell itself. The
console asks for the token once and keeps it in sessionStorage.
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any, Iterator

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from agent import Agent, AgentConfig

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                    format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("ai-pc.server")

AGENT_TOKEN = os.environ.get("AGENT_TOKEN", "")
STATE_DIR = Path(os.environ.get("STATE_DIR", "/state"))
SESSIONS_DIR = STATE_DIR / "sessions"
STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(title="AI Personal Computer", docs_url=None, redoc_url=None)
bearer = HTTPBearer(auto_error=False)
config = AgentConfig()


def require_token(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> None:
    if not AGENT_TOKEN:
        raise HTTPException(status_code=500, detail="AGENT_TOKEN is not configured")
    if creds is None or creds.credentials != AGENT_TOKEN:
        raise HTTPException(status_code=401, detail="bad or missing bearer token")


# ------------------------------------------------------------------ sessions

def session_path(session_id: str) -> Path:
    safe = "".join(c for c in session_id if c.isalnum() or c in "-_")
    if not safe:
        raise HTTPException(status_code=400, detail="bad session id")
    return SESSIONS_DIR / f"{safe}.json"


def save_session(session_id: str, record: dict[str, Any]) -> None:
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    path = session_path(session_id)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(record, indent=2, default=str), encoding="utf-8")
    tmp.replace(path)  # atomic: a crash mid-write never leaves a half session


def load_session(session_id: str) -> dict[str, Any]:
    path = session_path(session_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="no such session")
    return json.loads(path.read_text(encoding="utf-8"))


# ------------------------------------------------------------------- schemas

class RunRequest(BaseModel):
    task: str
    session_id: str | None = None


# -------------------------------------------------------------------- routes

@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "model": config.model, "sandbox": config.sandbox_url}


@app.get("/")
def console() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/sessions", dependencies=[Depends(require_token)])
def list_sessions() -> dict[str, Any]:
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    out = []
    for path in sorted(SESSIONS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        out.append({
            "session_id": record.get("session_id", path.stem),
            "task": record.get("task", ""),
            "started": record.get("started"),
            "events": len(record.get("events", [])),
        })
    return {"sessions": out[:100]}


@app.get("/api/sessions/{session_id}", dependencies=[Depends(require_token)])
def get_session(session_id: str) -> dict[str, Any]:
    return load_session(session_id)


@app.post("/api/run", dependencies=[Depends(require_token)])
def run(req: RunRequest, request: Request) -> StreamingResponse:
    session_id = req.session_id or uuid.uuid4().hex[:12]
    record: dict[str, Any] = {
        "session_id": session_id,
        "task": req.task,
        "started": time.time(),
        "events": [],
    }

    def stream() -> Iterator[str]:
        agent = Agent(config)
        try:
            for event in agent.run(req.task, run_id=session_id):
                record["events"].append({"kind": event.kind, "ts": event.ts, **event.data})
                yield f"data: {event.to_json()}\n\n"
        except Exception as exc:  # a crash should still reach the console
            log.exception("run failed")
            payload = json.dumps({"kind": "error", "message": str(exc)})
            record["events"].append(json.loads(payload))
            yield f"data: {payload}\n\n"
        finally:
            agent.close()
            record["finished"] = time.time()
            save_session(session_id, record)
            yield f"data: {json.dumps({'kind': 'done', 'session_id': session_id})}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
