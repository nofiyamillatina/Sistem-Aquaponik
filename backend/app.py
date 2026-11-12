import logging
from datetime import datetime, timezone

from flask import Flask, jsonify, request
from flask_cors import CORS

if __package__:
    from .config import Config
    from .firebase_service import FirebaseService
    from .fuzzy_engine import analyze
    from .serial_reader import SerialReader
else:  # pragma: no cover - script execution from the backend directory
    from config import Config
    from firebase_service import FirebaseService
    from fuzzy_engine import analyze
    from serial_reader import SerialReader

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def create_app(serial_reader=None, firebase_service=None):
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": Config.CORS_ALLOWED_ORIGINS}})

    firebase = firebase_service or FirebaseService(
        Config.FIREBASE_DATABASE_URL,
        Config.GOOGLE_APPLICATION_CREDENTIALS,
        Config.FIREBASE_RETRY_SECONDS,
    )

    def persist_reading(reading):
        try:
            if firebase.available:
                firebase.enqueue_reading(reading, analyze(reading))
        except Exception:
            logger.exception("Gagal menyimpan data serial ke Firebase.")

    reader = serial_reader or SerialReader(
        Config.SERIAL_PORT,
        Config.SERIAL_BAUD_RATE,
        Config.SERIAL_RETRY_SECONDS,
        Config.SENSOR_STALE_SECONDS,
        on_reading=persist_reading,
    )
    app.extensions["serial_reader"] = reader
    app.extensions["firebase_service"] = firebase

    @app.get("/api/sensors")
    def sensors():
        try:
            snapshot = reader.snapshot()
            reading = snapshot["reading"]
            if reading is None:
                reading_data = {
                    "temperature_c": None,
                    "temperature_valid": False,
                    "turbidity_adc": None,
                    "turbidity_kal": None,
                    "turbidity_valid": False,
                    "ph": None,
                    "ph_valid": False,
                    "pump_status": None,
                    "record_id": None,
                }
            else:
                reading_data = reading
            analysis = analyze(reading) if snapshot["online"] else {
                "status": "incomplete" if reading is None else "stale",
                "diagnosis": None,
                "message": (
                    "Belum ada pembacaan sensor."
                    if reading is None
                    else "Data sensor sudah kedaluwarsa atau koneksi serial terputus."
                ),
            }
            response = {
                **reading_data,
                "received_at": snapshot["last_received_at"],
                "data_fresh": snapshot["data_fresh"],
                "age_seconds": snapshot["age_seconds"],
                "serial_connected": snapshot["connected"],
                "esp32_online": snapshot["online"],
                "sensor_interval_seconds": Config.SENSOR_INTERVAL_SECONDS,
                "backend_connected": True,
                "analysis": analysis,
                "firebase": firebase.status,
            }
            return jsonify(response)
        except Exception:
            logger.exception("Gagal membentuk respons sensor.")
            return jsonify({"error": "Backend gagal membaca status sensor."}), 500

    @app.get("/api/history")
    def history():
        try:
            requested_limit = request.args.get("limit", default=100, type=int)
            if requested_limit is None or requested_limit < 1:
                return jsonify({"error": "Parameter limit harus berupa bilangan positif."}), 400
            limit = min(requested_limit, Config.HISTORY_MAX_ITEMS)
            readings = firebase.get_history(limit)
            return jsonify({"readings": readings, "available": True})
        except Exception:
            logger.exception("Gagal mengambil riwayat Firebase.")
            return jsonify({
                "readings": [],
                "available": False,
                "error": "Riwayat Firebase tidak dapat diakses.",
            }), 503

    @app.get("/api/status")
    def status():
        try:
            snapshot = reader.snapshot()
            return jsonify({
                "backend": "online",
                "serial_port": Config.SERIAL_PORT,
                "serial_connected": snapshot["connected"],
                "esp32_online": snapshot["online"],
                "data_fresh": snapshot["data_fresh"],
                "last_received_at": snapshot["last_received_at"],
                "age_seconds": snapshot["age_seconds"],
                "serial_error": snapshot["error"],
                "firebase": firebase.status,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            logger.exception("Gagal membentuk status backend.")
            return jsonify({"error": "Backend gagal membaca status sistem."}), 500

    return app


app = create_app()


if __name__ == "__main__":
    serial_reader = app.extensions["serial_reader"]
    firebase_service = app.extensions["firebase_service"]
    firebase_service.start_writer()
    serial_reader.start()
    try:
        app.run(
            host=Config.FLASK_HOST,
            port=Config.FLASK_PORT,
            debug=False,
            use_reloader=False,
        )
    finally:
        serial_reader.stop()
        firebase_service.stop_writer()
