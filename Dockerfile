FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    OMP_NUM_THREADS=1 \
    TOKENIZERS_PARALLELISM=false \
    HF_HOME=/home/user/.cache/huggingface \
    TRANSFORMERS_CACHE=/home/user/.cache/huggingface/transformers \
    PORT=7860

RUN useradd -m -u 1000 user

WORKDIR /home/user/app

RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl \
    && rm -rf /var/lib/apt/lists/*

COPY --chown=user:user requirements.txt .
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

COPY --chown=user:user . .

USER user

EXPOSE 7860

CMD ["uvicorn", "api_clip:app", "--host", "0.0.0.0", "--port", "7860"]
