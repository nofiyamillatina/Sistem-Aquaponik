import os

from dotenv import load_dotenv

load_dotenv()


def _read_allowed_origins():
    configured = os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://127.0.0.1:5500,http://localhost:5500",
    )
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


class Config:
    SERIAL_PORT = os.getenv("SERIAL_PORT", "COM3")
    SERIAL_BAUD_RATE = int(os.getenv("SERIAL_BAUD_RATE", "115200"))
    SENSOR_INTERVAL_MS = int(os.getenv("SENSOR_INTERVAL_MS", "180000"))
    SENSOR_INTERVAL_SECONDS = SENSOR_INTERVAL_MS / 1000
    SERIAL_RETRY_SECONDS = float(os.getenv("SERIAL_RETRY_SECONDS", "3"))
    SENSOR_STALE_SECONDS = float(
        os.getenv("SENSOR_STALE_SECONDS", str(SENSOR_INTERVAL_SECONDS * 2))
    )
    FLASK_HOST = os.getenv("FLASK_HOST", "127.0.0.1")
    FLASK_PORT = int(os.getenv("FLASK_PORT", "5000"))
    CORS_ALLOWED_ORIGINS = _read_allowed_origins()
    FIREBASE_DATABASE_URL = os.getenv("FIREBASE_DATABASE_URL", "")
    GOOGLE_APPLICATION_CREDENTIALS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
    HISTORY_MAX_ITEMS = 1000
    FIREBASE_RETRY_SECONDS = float(os.getenv("FIREBASE_RETRY_SECONDS", "10"))
