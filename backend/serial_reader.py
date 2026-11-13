import json
import logging
import math
import threading
import time
import uuid
from datetime import datetime, timezone

import serial

logger = logging.getLogger(__name__)


def _is_finite_number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def validate_sensor_payload(payload):
    if not isinstance(payload, dict):
        raise ValueError("Serial JSON harus berupa objek.")

    for field in ("temperature_valid", "turbidity_valid", "ph_valid"):
        if not isinstance(payload.get(field), bool):
            raise ValueError(f"{field} harus berupa boolean.")

    temperature = payload.get("temperature_c")
    if payload["temperature_valid"]:
        if not _is_finite_number(temperature):
            raise ValueError("temperature_c tidak valid.")
        if float(temperature) == -127.0:
            payload["temperature_valid"] = False
            payload["temperature_c"] = None
            temperature = None
    elif temperature is not None:
        raise ValueError("temperature_c harus null saat sensor suhu tidak valid.")

    adc = payload.get("turbidity_adc")
    kal = payload.get("turbidity_kal")
    if payload["turbidity_valid"]:
        if isinstance(adc, bool) or not isinstance(adc, int) or not 0 <= adc <= 4095:
            raise ValueError("turbidity_adc harus integer dalam rentang 0-4095.")
        if adc >= 4090:
            payload["turbidity_valid"] = False
            payload["turbidity_adc"] = None
            payload["turbidity_kal"] = None
            adc = None
            kal = None
        else:
            if not _is_finite_number(kal):
                raise ValueError("turbidity_kal tidak valid.")
            expected_kal = (adc - 2717.6) / -18.189
            if not math.isclose(kal, expected_kal, abs_tol=0.011):
                raise ValueError("turbidity_kal tidak sesuai rumus kalibrasi dari ADC.")
    elif adc is not None or kal is not None:
        raise ValueError("Nilai turbidity harus null saat sensor tidak valid.")

    ph = payload.get("ph")
    if payload["ph_valid"]:
        if not _is_finite_number(ph):
            raise ValueError("ph tidak valid.")
    elif ph is not None:
        raise ValueError("ph harus null saat sensor pH tidak valid.")

    if payload.get("pump_status") != "ON":
        raise ValueError("pump_status harus ON sesuai konfigurasi Always ON.")

    return {
        "temperature_c": temperature if payload["temperature_valid"] else None,
        "temperature_valid": payload["temperature_valid"],
        "turbidity_adc": adc if payload["turbidity_valid"] else None,
        "turbidity_kal": kal if payload["turbidity_valid"] else None,
        "turbidity_valid": payload["turbidity_valid"],
        "ph": ph if payload["ph_valid"] else None,
        "ph_valid": payload["ph_valid"],
        "pump_status": payload["pump_status"],
    }


class SerialReader:
    def __init__(self, port, baud_rate, retry_seconds, stale_seconds, on_reading=None):
        self.port = port
        self.baud_rate = baud_rate
        self.retry_seconds = retry_seconds
        self.stale_seconds = stale_seconds
        self.on_reading = on_reading
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread = None
        self._latest = None
        self._latest_received_monotonic = None
        self._connected = False
        self._error = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, name="esp32-serial", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=3)

    def _set_connection(self, connected, error=None):
        with self._lock:
            self._connected = connected
            self._error = error

    def _accept_line(self, line):
        stripped = line.strip()
        if not stripped:
            return
        if stripped.startswith("#"):
            logger.info("Firmware: %s", stripped[1:].strip())
            return
        try:
            payload = validate_sensor_payload(json.loads(stripped))
        except (json.JSONDecodeError, ValueError) as error:
            logger.warning("Mengabaikan baris serial tidak valid: %s", error)
            return

        payload["received_at"] = datetime.now(timezone.utc).isoformat()
        payload["record_id"] = uuid.uuid4().hex
        with self._lock:
            self._latest = payload
            self._latest_received_monotonic = time.monotonic()
            self._error = None
        if self.on_reading:
            try:
                self.on_reading(payload)
            except Exception:
                logger.exception("Gagal meneruskan pembacaan ke Firebase.")

    def _run(self):
        while not self._stop_event.is_set():
            try:
                with serial.Serial(self.port, self.baud_rate, timeout=1) as connection:
                    self._set_connection(True)
                    logger.info("Serial ESP32 terhubung pada %s.", self.port)
                    while not self._stop_event.is_set():
                        raw = connection.readline()
                        if raw:
                            self._accept_line(raw.decode("utf-8", errors="replace"))
            except (serial.SerialException, OSError) as error:
                self._set_connection(False, str(error))
                logger.warning("Port serial %s tidak tersedia: %s", self.port, error)
                self._stop_event.wait(self.retry_seconds)
            except Exception as error:
                self._set_connection(False, str(error))
                logger.exception("Kesalahan pembaca serial.")
                self._stop_event.wait(self.retry_seconds)
        self._set_connection(False, "Pembaca serial dihentikan.")

    def snapshot(self):
        with self._lock:
            latest = dict(self._latest) if self._latest else None
            received_monotonic = self._latest_received_monotonic
            connected = self._connected
            error = self._error
        age_seconds = None
        if latest and received_monotonic is not None:
            age_seconds = time.monotonic() - received_monotonic
        fresh = latest is not None and age_seconds <= self.stale_seconds
        return {
            "connected": connected,
            "online": connected and fresh,
            "data_fresh": fresh,
            "reading": latest,
            "last_received_at": latest["received_at"] if latest else None,
            "age_seconds": age_seconds,
            "error": error if not connected else None,
        }
