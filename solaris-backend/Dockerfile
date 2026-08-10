FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Generate data and train models
RUN python -m app.ingestion.fetch_historical --start 2026-02-10 --end yesterday
RUN python -m app.feature_store
RUN python -m app.train_nso_models
RUN python -m app.data_pipeline
RUN python -m app.train_solar_model

EXPOSE 7860

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
