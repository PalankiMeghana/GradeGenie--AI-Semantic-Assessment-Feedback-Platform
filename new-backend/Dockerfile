FROM python:3.10-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       tesseract-ocr \
       poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY final_app.py .
COPY rubrics_v5.json .
COPY training_data.jsonl .

ENV PYTHONUNBUFFERED=1
ENV OMP_NUM_THREADS=1
ENV MKL_NUM_THREADS=1

CMD exec gunicorn \
    --bind 0.0.0.0:${PORT} \
    --workers 1 \
    --threads 1 \
    --timeout 180 \
    final_app:app