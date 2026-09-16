FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Non-root. /state and /workspace are volumes, so they are chowned at build
# time and the compose file mounts over them.
RUN useradd --create-home --uid 10001 agent \
 && mkdir -p /state /workspace \
 && chown -R agent:agent /app /state /workspace
USER agent

EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
