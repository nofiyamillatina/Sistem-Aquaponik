import { BACKEND_BASE_URL, MAX_HISTORY_SAMPLES, REQUEST_TIMEOUT_MS } from './config.js';

function isIntegerInRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

export function validateSensorResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Respons API bukan objek JSON.');
  }
  if (typeof payload.temperature_valid !== 'boolean') {
    throw new TypeError('Field temperature_valid tidak valid.');
  }
  if (payload.temperature_valid && !Number.isFinite(payload.temperature_c)) {
    throw new TypeError('temperature_c harus berupa angka valid saat sensor aktif.');
  }
  if (!payload.temperature_valid && payload.temperature_c !== null) {
    throw new TypeError('temperature_c harus null saat sensor suhu tidak valid.');
  }
  if (typeof payload.turbidity_valid !== 'boolean') {
    throw new TypeError('Field turbidity_valid tidak valid.');
  }
  if (payload.turbidity_valid) {
    if (!isIntegerInRange(payload.turbidity_adc, 0, 4095)) {
      throw new TypeError('turbidity_adc harus berupa integer antara 0 dan 4095.');
    }
    if (!Number.isFinite(payload.turbidity_kal)) {
      throw new TypeError('turbidity_kal harus berupa angka valid.');
    }
  } else if (payload.turbidity_adc !== null || payload.turbidity_kal !== null) {
    throw new TypeError('Nilai turbidity harus null saat sensor tidak valid.');
  }
  if (typeof payload.ph_valid !== 'boolean') {
    throw new TypeError('Field ph_valid tidak valid.');
  }
  if (payload.ph_valid && !Number.isFinite(payload.ph)) {
    throw new TypeError('ph harus berupa angka valid saat sensor pH aktif.');
  }
  if (!payload.ph_valid && payload.ph !== null) {
    throw new TypeError('ph harus null saat sensor pH belum tersedia.');
  }
  if (typeof payload.esp32_online !== 'boolean') {
    throw new TypeError('Field esp32_online tidak valid.');
  }
  if (typeof payload.serial_connected !== 'boolean' || typeof payload.data_fresh !== 'boolean') {
    throw new TypeError('Status serial/data_fresh tidak valid.');
  }
  if (payload.data_fresh && !payload.received_at) {
    throw new TypeError('received_at wajib tersedia untuk data sensor yang masih segar.');
  }
  if (payload.received_at && !Number.isFinite(new Date(payload.received_at).getTime())) {
    throw new TypeError('received_at bukan timestamp yang valid.');
  }
  if (payload.pump_status !== 'ON' && payload.esp32_online) {
    throw new TypeError('Status perintah pompa tidak sesuai konfigurasi Always ON.');
  }

  return {
    temperature_c: payload.temperature_valid ? payload.temperature_c : null,
    temperature_valid: payload.temperature_valid,
    turbidity_adc: payload.turbidity_valid ? payload.turbidity_adc : null,
    turbidity_kal: payload.turbidity_valid ? payload.turbidity_kal : null,
    turbidity_valid: payload.turbidity_valid,
    ph: payload.ph_valid ? payload.ph : null,
    ph_valid: payload.ph_valid,
    pump_status: payload.pump_status,
    esp32_online: payload.esp32_online,
    serial_connected: payload.serial_connected,
    data_fresh: payload.data_fresh,
    age_seconds: payload.age_seconds,
    record_id: payload.record_id,
    received_at: payload.received_at,
    analysis: payload.analysis,
    firebase: payload.firebase,
  };
}

async function requestJson(path) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${BACKEND_BASE_URL.replace(/\/+$/, '')}${path}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Flask Backend mengembalikan HTTP ${response.status}.`);
    }
    return await response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function fetchSensorReadings() {
  return validateSensorResponse(await requestJson('/api/sensors'));
}

export async function fetchSensorHistory() {
  const payload = await requestJson(`/api/history?limit=${MAX_HISTORY_SAMPLES}`);
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.readings)) {
    throw new TypeError('Riwayat sensor tidak valid.');
  }

  const readings = payload.readings.map((reading) => {
    const receivedAt = new Date(reading.received_at || reading.timestamp);
    if (!Number.isFinite(receivedAt.getTime())) {
      throw new TypeError('Timestamp pada riwayat sensor tidak valid.');
    }
    return {
      record_id: reading.record_id,
      temperature_c: reading.temperature_valid && Number.isFinite(reading.temperature_c) ? reading.temperature_c : null,
      ph: reading.ph_valid && Number.isFinite(reading.ph) ? reading.ph : null,
      turbidity_adc: reading.turbidity_valid && isIntegerInRange(reading.turbidity_adc, 0, 4095)
        ? reading.turbidity_adc : null,
      turbidity_kal: reading.turbidity_valid && Number.isFinite(reading.turbidity_kal) ? reading.turbidity_kal : null,
      temperature_valid: reading.temperature_valid === true,
      turbidity_valid: reading.turbidity_valid === true,
      ph_valid: reading.ph_valid === true,
      receivedAt,
    };
  });
  return { available: payload.available === true, readings };
}
