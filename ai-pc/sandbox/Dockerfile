# Playwright's image already carries Chromium plus its system libraries and a
# non-root `pwuser`. Pinned: an unpinned browser base drifts under you.
FROM mcr.microsoft.com/playwright/python:v1.47.0-jammy

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    WORKSPACE_ROOT=/workspace

RUN pip install --no-cache-dir \
      "fastapi==0.115.*" \
      "uvicorn[standard]==0.30.*" \
      "pydantic==2.*"

WORKDIR /app
COPY executor.py entrypoint.sh ./
RUN chmod +x entrypoint.sh \
 && mkdir -p /workspace \
 && chown -R pwuser:pwuser /app /workspace

USER pwuser
EXPOSE 8080
ENTRYPOINT ["./entrypoint.sh"]
