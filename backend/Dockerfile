FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install \
    --default-timeout=300 \
    --retries 20 \
    --index-url https://pypi.org/simple \
    -r requirements.txt

COPY . .

RUN useradd --create-home bfl

USER bfl

EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "90", "--graceful-timeout", "30", "--access-logfile", "-"]