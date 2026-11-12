import logging
import threading
from collections import deque
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, db

logger = logging.getLogger(__name__)


class FirebaseService:
    def __init__(self, database_url, credentials_path="", retry_seconds=10):
        self._app = None
        self._error = None
        self._last_success_at = None
        self._last_operation = None
        self._lock = threading.Lock()
        self._pending = deque()
        self._pending_ids = set()
        self._pending_lock = threading.Lock()
        self._retry_seconds = retry_seconds
        self._worker_stop = threading.Event()
        self._worker_wake = threading.Event()
        self._worker = None
        if not database_url:
            self._error = "FIREBASE_DATABASE_URL belum dikonfigurasi."
            logger.warning(self._error)
            return

        try:
            if credentials_path:
                credential = credentials.Certificate(credentials_path)
            else:
                credential = credentials.ApplicationDefault()
            try:
                self._app = firebase_admin.get_app("simponi")
            except ValueError:
                self._app = firebase_admin.initialize_app(
                    credential, {"databaseURL": database_url}, name="simponi"
                )
        except Exception as error:
            self._error = f"Firebase initialization failed: {error}"
            logger.exception("Firebase initialization failed.")

    @property
    def available(self):
        return self._app is not None

    @property
    def status(self):
        with self._lock:
            success_is_recent = False
            if self._last_success_at:
                last_success = datetime.fromisoformat(self._last_success_at)
                success_is_recent = (
                    datetime.now(timezone.utc) - last_success
                ).total_seconds() <= 120
            return {
                "initialized": self.available,
                "connected": (
                    self._last_operation is not None
                    and self._last_operation["success"]
                    and success_is_recent
                ),
                "last_operation": self._last_operation,
                "last_success_at": self._last_success_at,
                "error": self._error,
                "pending_writes": self.pending_writes,
            }

    @property
    def pending_writes(self):
        with self._pending_lock:
            return len(self._pending)

    def enqueue_reading(self, reading, analysis):
        if not self.available:
            raise RuntimeError(self._error or "Firebase tidak tersedia.")
        record_id = reading["record_id"]
        with self._pending_lock:
            if record_id in self._pending_ids:
                return
            if len(self._pending) >= 1000:
                raise RuntimeError("Antrean tulis Firebase penuh; pembacaan tidak dapat diantrekan.")
            self._pending.append((dict(reading), dict(analysis)))
            self._pending_ids.add(record_id)
        self._worker_wake.set()

    def start_writer(self):
        if not self.available or (self._worker and self._worker.is_alive()):
            return
        self._worker_stop.clear()
        self._worker = threading.Thread(
            target=self._write_pending, name="firebase-writer", daemon=True
        )
        self._worker.start()

    def stop_writer(self):
        self._worker_stop.set()
        self._worker_wake.set()
        if self._worker:
            self._worker.join(timeout=3)
        pending = self.pending_writes
        if pending:
            logger.warning(
                "%d pembacaan masih menunggu Firebase saat backend dihentikan.",
                pending,
            )

    def _write_pending(self):
        while not self._worker_stop.is_set():
            self._worker_wake.wait(self._retry_seconds)
            self._worker_wake.clear()
            while not self._worker_stop.is_set():
                with self._pending_lock:
                    item = self._pending[0] if self._pending else None
                if item is None:
                    break
                reading, analysis = item
                try:
                    self.save_reading(reading, analysis)
                except Exception:
                    self._worker_stop.wait(self._retry_seconds)
                    break
                with self._pending_lock:
                    if self._pending and self._pending[0][0]["record_id"] == reading["record_id"]:
                        self._pending.popleft()
                        self._pending_ids.discard(reading["record_id"])

    def _reference(self, path=None):
        return db.reference(path, app=self._app)

    def _record_operation(self, operation, success, error=None):
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            self._last_operation = {
                "name": operation,
                "success": success,
                "timestamp": now,
            }
            if success:
                self._last_success_at = now
                self._error = None
            else:
                self._error = str(error) if error else "Firebase operation failed."

    def save_reading(self, reading, analysis):
        if not self.available:
            raise RuntimeError(self._error or "Firebase tidak tersedia.")

        record = dict(reading)
        record["timestamp"] = reading["received_at"]
        record["timestamp_epoch"] = int(
            datetime.fromisoformat(reading["received_at"]).timestamp() * 1000
        )
        key = record.get("record_id") or self._reference("sensor_readings").push().key
        if not key:
            raise RuntimeError("Firebase gagal membuat ID riwayat.")
        record["record_id"] = key
        updates = {
            f"sensor_readings/{key}": record,
            "latest_readings": record,
            "system_status": {
                "esp32_online": True,
                "serial_connected": True,
                "last_received_at": record["timestamp"],
                "firebase_updated_at": datetime.now(timezone.utc).isoformat(),
            },
        }
        if analysis.get("status") == "complete":
            updates[f"fuzzy_results/{key}"] = {
                "record_id": key,
                "timestamp": record["timestamp"],
                **analysis,
            }
        try:
            self._reference().update(updates)
        except Exception as error:
            self._record_operation("save_reading", False, error)
            logger.exception("Firebase gagal menyimpan pembacaan.")
            raise
        self._record_operation("save_reading", True)
        return record

    def get_history(self, limit):
        if not self.available:
            raise RuntimeError(self._error or "Firebase tidak tersedia.")
        try:
            values = self._reference("sensor_readings").order_by_child(
                "timestamp_epoch"
            ).limit_to_last(limit).get()
        except Exception as error:
            self._record_operation("get_history", False, error)
            logger.exception("Firebase gagal mengambil riwayat.")
            raise
        if not values:
            self._record_operation("get_history", True)
            return []
        readings = [
            {"record_id": key, **value}
            for key, value in values.items()
            if isinstance(value, dict)
        ]
        readings.sort(key=lambda item: item.get("timestamp_epoch", 0))
        self._record_operation("get_history", True)
        return readings
