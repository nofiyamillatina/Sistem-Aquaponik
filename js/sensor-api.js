
import {
  child,
  get,
  limitToLast,
  orderByChild,
  query,
  ref
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js";

import { database, firebaseReady } from "./firebase-client.js";
import {
  MAX_HISTORY_SAMPLES,
  SENSOR_INTERVAL_SECONDS
} from "./config.js";

const STALE_AFTER_SECONDS = SENSOR_INTERVAL_SECONDS * 2;

function toValidDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizeReading(reading) {
  const receivedAt = toValidDate(
    reading.received_at || reading.timestamp
  );

  const ageSeconds = receivedAt
    ? Math.max(0, (Date.now() - receivedAt.getTime()) / 1000)
    : null;

  const dataFresh =
    ageSeconds !== null &&
    ageSeconds <= STALE_AFTER_SECONDS;

  const temperatureValid =
    reading.temperature_valid === true &&
    Number.isFinite(reading.temperature_c);

  const phValid =
    reading.ph_valid === true &&
    Number.isFinite(reading.ph);

  const turbidityValid =
    reading.turbidity_valid === true &&
    Number.isInteger(reading.turbidity_adc) &&
    reading.turbidity_adc >= 0 &&
    reading.turbidity_adc <= 4095;

  return {
    temperature_c: temperatureValid
      ? reading.temperature_c : null,
    temperature_valid: temperatureValid,

    ph: phValid ? reading.ph : null,
    ph_valid: phValid,

    turbidity_adc: turbidityValid
      ? reading.turbidity_adc : null,
    turbidity_valid: turbidityValid,

    pump_status: reading.pump_status || null,

    record_id: reading.record_id || null,
    received_at: receivedAt?.toISOString() || null,

    data_fresh: dataFresh,
    age_seconds: ageSeconds,

    serial_connected: dataFresh,
    esp32_online: dataFresh,

    analysis: {
      status: dataFresh ? "incomplete" : "stale",
      diagnosis: null,
      recommendation: null,
      message: dataFresh
        ? "Hasil diagnosis belum tersedia."
        : "Data sensor sudah kedaluwarsa."
    },

    firebase: {
      initialized: true,
      connected: true,
      pending_writes: 0
    }
  };
}

export async function fetchSensorReadings() {
  await firebaseReady;

  const [readingSnapshot, statusSnapshot] = await Promise.all([
    get(ref(database, "latest_readings")),
    get(ref(database, "system_status"))
  ]);

  if (!readingSnapshot.exists()) {
    throw new Error("Belum ada pembacaan sensor di Firebase.");
  }

  const reading = readingSnapshot.val();
  const systemStatus = statusSnapshot.exists()
    ? statusSnapshot.val()
    : {};

  const result = normalizeReading(reading);

  // Ambil diagnosis yang sesuai dengan record sensor terbaru.
  if (result.record_id) {
    const analysisSnapshot = await get(
      child(ref(database, "fuzzy_results"), result.record_id)
    );

    if (analysisSnapshot.exists()) {
      const savedAnalysis = analysisSnapshot.val();

      result.analysis = {
        status: savedAnalysis.status,
        diagnosis: savedAnalysis.diagnosis || null,
        recommendation: savedAnalysis.recommendation || null,
        message: savedAnalysis.message || ""
      };
    }
  }

  // Status sistem berdasarkan waktu pembacaan terakhir.
  if (systemStatus.last_received_at && result.received_at) {
    const statusTime = toValidDate(systemStatus.last_received_at);
    const readingTime = toValidDate(result.received_at);

    if (
      statusTime &&
      readingTime &&
      Math.abs(statusTime.getTime() - readingTime.getTime()) > 5000
    ) {
      console.warn("Waktu status Firebase berbeda dari data sensor.");
    }
  }

  if (!result.data_fresh) {
    result.analysis.status = "stale";
    result.analysis.diagnosis = null;
    result.analysis.recommendation = null;
  }

  return result;
}

export async function fetchSensorHistory() {
  await firebaseReady;

  const historyQuery = query(
    ref(database, "sensor_readings"),
    orderByChild("timestamp_epoch"),
    limitToLast(MAX_HISTORY_SAMPLES)
  );

  const snapshot = await get(historyQuery);

  if (!snapshot.exists()) {
    return {
      available: true,
      readings: []
    };
  }

  const values = snapshot.val();

  const readings = Object.entries(values)
    .map(([key, reading]) => {
      const receivedAt = toValidDate(
        reading.received_at || reading.timestamp
      );

      if (!receivedAt) return null;

      return {
        record_id: reading.record_id || key,

        temperature_c:
          reading.temperature_valid === true &&
          Number.isFinite(reading.temperature_c)
            ? reading.temperature_c : null,

        ph:
          reading.ph_valid === true &&
          Number.isFinite(reading.ph)
            ? reading.ph : null,

        turbidity_adc:
          reading.turbidity_valid === true &&
          Number.isInteger(reading.turbidity_adc)
            ? reading.turbidity_adc : null,

        temperature_valid: reading.temperature_valid === true,
        ph_valid: reading.ph_valid === true,
        turbidity_valid: reading.turbidity_valid === true,

        receivedAt
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.receivedAt - b.receivedAt);

  return {
    available: true,
    readings
  };
}
