FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app
COPY requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock \
    && useradd --create-home --uid 10001 tibby

COPY app.py models.py providers.py records.py ./
USER tibby
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.getenv('PORT', '8000') + '/health', timeout=4)"

# Keep one worker while sessions/history are held in process memory.
CMD ["sh", "-c", "exec python -m uvicorn app:app --host 0.0.0.0 --port \"${PORT:-8000}\" --workers 1"]
