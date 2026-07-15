# Ingest-сервис (Python FastAPI): Docling, chunking, bge-m3, Qdrant.
# Контекст сборки — apps/ingest:  docker build apps/ingest
FROM python:3.11-slim

WORKDIR /app

# torch — CPU-сборка (иначе pip на linux тянет многогигабайтные CUDA-колёса;
# прод — сервер без GPU, см. docs/02-ARCHITECTURE.md).
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Веса bge-m3 / bge-reranker-v2-m3 (~2.5GB) скачиваются при первом старте в
# HF_HOME — примонтируйте volume, чтобы не качать при каждом пересоздании.
ENV HF_HOME=/models
VOLUME /models

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --retries=10 --start-period=60s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
