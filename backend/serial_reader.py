
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

    # Validasi suhu
    temperature = payload.get("temperature_c")

    if payload["temperature_valid"]:
        if not _is_finite_number(temperature):
            raise ValueError("temperature_c tidak valid.")

        if float(temperature) == -127.0:
            payload["temperature_valid"] = False
            payload["temperature_c"] = None
            temperature = None

    elif temperature is not None:
        raise ValueError(
            "temperature_c harus null saat sensor suhu tidak valid."
        )

    # Validasi turbidity
    adc = payload.get("turbidity_adc")
    turbidity_status = payload.get("turbidity_status")

    if payload["turbidity_valid"]:
        if (
            isinstance(adc, bool)
            or not isinstance(adc, int)
            or not 0 <= adc <= 4095
        ):
            raise ValueError(
                "turbidity_adc harus integer dalam rentang 0-4095."
            )

        if adc >= 4090:
            payload["turbidity_valid"] = False
            payload["turbidity_adc"] = None
            adc = None
            turbidity_status = None
        else:
            expected_status = (
                "Jernih" if adc > 1155
                else "Keruh" if adc >= 941
                else "Sangat Keruh"
            )

            if turbidity_status != expected_status:
                raise ValueError(
                    "turbidity_status tidak sesuai dengan ADC."
                )

    elif adc is not None or turbidity_status is not None:
        raise ValueError(
            "Nilai turbidity harus null saat sensor tidak valid."
        )

    # Validasi pH
    ph = payload.get("ph")

    if payload["ph_valid"]:
        if not _is_finite_number(ph):
            raise ValueError("ph tidak valid.")

    elif ph is not None:
        raise ValueError("ph harus null saat sensor pH tidak valid.")

    # Validasi pompa
    if payload.get("pump_status") != "ON":
        raise ValueError(
            "pump_status harus ON sesuai konfigurasi Always ON."
        )

    return {
        "temperature_c": (
            temperature if payload["temperature_valid"] else None
        ),
        "temperature_valid": payload["temperature_valid"],
        "turbidity_adc": (
            adc if payload["turbidity_valid"] else None
        ),
        "turbidity_status": (
            turbidity_status if payload["turbidity_valid"] else None
        ),
        "turbidity_valid": payload["turbidity_valid"],
        "ph": ph if payload["ph_valid"] else None,
        "ph_valid": payload["ph_valid"],
        "pump_status": payload["pump_status"],
    }


class SerialReader:
    def __init__(
        self,
        port,
        baudrate,
        retry_seconds,
        stale_seconds,
        on_reading=None,
    ):
        self.port = port
        self.baudrate = baudrate
        self.retry_seconds = retry_seconds
        self.stale_seconds = stale_seconds
        self.on_reading = on_reading

        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread = None

        self._connected = False
        self._reading = None
        self._last_received_at = None
        self._last_received_monotonic = None
        self._error = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run,
            name="SerialReader",
            daemon=True,
        )
        self._thread.start()

        logger.info("SerialReader dimulai pada %s.", self.port)

    def stop(self):
        self._stop_event.set()

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3)

        with self._lock:
            self._connected = False

        logger.info("SerialReader dihentikan.")

    def _run(self):
        while not self._stop_event.is_set():
            try:
                with serial.Serial(
                    self.port,
                    self.baudrate,
                    timeout=1,
                ) as connection:

                    with self._lock:
                        self._connected = True
                        self._error = None

                    logger.info(
                        "Serial terhubung ke %s.",
                        self.port,
                    )

                    while not self._stop_event.is_set():
                        line = connection.readline()

                        if line:
                            self._accept_line(line)

            except (serial.SerialException, OSError) as exc:
                with self._lock:
                    self._connected = False
                    self._error = str(exc)

                logger.warning(
                    "Koneksi serial gagal: %s. Mencoba kembali...",
                    exc,
                )

            except Exception as exc:
                with self._lock:
                    self._connected = False
                    self._error = str(exc)

                logger.exception("Kesalahan SerialReader.")

            finally:
                with self._lock:
                    self._connected = False

            self._stop_event.wait(self.retry_seconds)

    def _accept_line(self, line):
        try:
            if isinstance(line, bytes):
                line = line.decode("utf-8", errors="replace")

            line = line.strip()

            if not line or line.startswith("#"):
                return

            payload = json.loads(line)
            reading = validate_sensor_payload(payload)

            received_at = datetime.now(timezone.utc).isoformat()

            reading["received_at"] = received_at
            reading["record_id"] = str(uuid.uuid4())

            with self._lock:
                self._reading = reading.copy()
                self._last_received_at = received_at
                self._last_received_monotonic = time.monotonic()
                self._error = None

            logger.debug("Data sensor diterima: %s", reading)

            if self.on_reading:
                try:
                    self.on_reading(reading.copy())
                except Exception:
                    logger.exception(
                        "Callback penyimpanan data gagal."
                    )

        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            logger.warning(
                "Data serial tidak valid: %s | Baris: %r",
                exc,
                line,
            )

    def snapshot(self):
        with self._lock:
            reading = (
                self._reading.copy()
                if self._reading is not None
                else None
            )

            connected = self._connected
            last_received_at = self._last_received_at
            last_received_monotonic = self._last_received_monotonic
            error = self._error

        if last_received_monotonic is None:
            age_seconds = None
            data_fresh = False
        else:
            age_seconds = max(
                0,
                time.monotonic() - last_received_monotonic,
            )
            data_fresh = age_seconds <= self.stale_seconds

        online = connected and data_fresh

        return {
            "reading": reading,
            "connected": connected,
            "online": online,
            "data_fresh": data_fresh,
            "last_received_at": last_received_at,
            "age_seconds": age_seconds,
            "error": error,
        }
