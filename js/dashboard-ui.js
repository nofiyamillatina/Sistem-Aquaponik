import { MAX_LOG_ROWS } from './config.js';

function requiredElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemen dashboard #${id} tidak ditemukan.`);
  return element;
}

const elements = {
  connectionIndicator: requiredElement('connection-indicator'),
  connectionStatus: requiredElement('connection-status'),
  lastUpdated: requiredElement('last-updated'),
  temperatureValue: requiredElement('temperature-value'),
  temperatureStatus: requiredElement('temperature-status'),
  temperatureTrend: requiredElement('temperature-trend'),
  phStatus: requiredElement('ph-status'),
  phValue: requiredElement('ph-value'),
  turbidityAdc: requiredElement('turbidity-adc'),
  turbidityKal: requiredElement('turbidity-kal'),
  turbidityStatus: requiredElement('turbidity-status'),
  turbidityClassification: requiredElement('turbidity-classification'),
  pumpStatus: requiredElement('pump-status'),
  conditionLabel: requiredElement('water-condition-label'),
  conditionDescription: requiredElement('water-condition-description'),
  conditionSymbol: requiredElement('water-condition-symbol'),
  chartDescription: requiredElement('chart-description'),
  temperatureSeries: requiredElement('temperature-series'),
  phSeries: requiredElement('ph-series'),
  turbiditySeries: requiredElement('turbidity-series'),
  temperaturePoint: requiredElement('temperature-point'),
  phPoint: requiredElement('ph-point'),
  turbidityPoint: requiredElement('turbidity-point'),
  chartStartTime: requiredElement('chart-start-time'),
  chartEndTime: requiredElement('chart-end-time'),
  sampleCount: requiredElement('sample-count'),
  logBody: requiredElement('sensor-log-body'),
  logStatus: requiredElement('sensor-log-status'),
};

function formatTime(date) {
  const value = date instanceof Date ? date : new Date(date);
  return value.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function setSensorLabel(element, text, state) {
  element.textContent = text;
  element.classList.remove('sensor-good', 'sensor-warning', 'sensor-bad', 'sensor-unknown');
  element.classList.add(`sensor-${state}`);
}

function setConnectionStatus(online, details = '', label = '') {
  elements.connectionIndicator.classList.toggle('connection-online', online);
  elements.connectionIndicator.classList.toggle('connection-offline', !online);
  elements.connectionStatus.textContent = label || (online ? 'ESP32 Online' : 'ESP32 Offline');
  elements.connectionIndicator.title = details;
}

function renderDiagnosis(readings) {
  const analysis = readings.analysis;
  const completeInputs = readings.temperature_valid && readings.ph_valid && readings.turbidity_valid;
  const current = readings.esp32_online && readings.data_fresh;
  const label = String(analysis?.diagnosis?.label || '').trim().toLowerCase();
  const categories = {
    baik: {
      label: 'Baik',
      className: 'bg-emerald-100 text-emerald-800',
      symbol: 'check_circle',
      description: `Kombinasi suhu ${readings.temperature_c.toFixed(1)}°C, pH ${readings.ph.toFixed(1)}, dan kekeruhan (ADC ${readings.turbidity_adc}, KAL ${readings.turbidity_kal}) menunjukkan kondisi yang baik untuk mendukung metabolisme Ikan Nila serta penyerapan nutrisi oleh Tanaman Selada.`,
    },
    'perlu perhatian': {
      label: 'Perlu Perhatian',
      className: 'bg-amber-100 text-amber-800',
      symbol: 'info',
      description: `Kombinasi parameter suhu ${readings.temperature_c.toFixed(1)}°C, pH ${readings.ph.toFixed(1)}, dan kekeruhan (ADC ${readings.turbidity_adc}, KAL ${readings.turbidity_kal}) menunjukkan kondisi yang perlu dipantau agar tidak mengganggu kesehatan Ikan Nila dan penyerapan nutrisi Tanaman Selada.`,
    },
    buruk: {
      label: 'Buruk',
      className: 'bg-rose-100 text-rose-800',
      symbol: 'warning',
      description: `Kombinasi parameter suhu ${readings.temperature_c.toFixed(1)}°C, pH ${readings.ph.toFixed(1)}, dan kekeruhan (ADC ${readings.turbidity_adc}, KAL ${readings.turbidity_kal}) menunjukkan kondisi yang dapat mengganggu kesehatan Ikan Nila dan pertumbuhan Tanaman Selada. Diperlukan evaluasi untuk menjaga keseimbangan ekosistem aquaponik.`,
    },
  };
  const category = categories[label];

  elements.conditionLabel.classList.remove(
    'bg-slate-100', 'text-slate-700',
    'bg-emerald-100', 'text-emerald-800',
    'bg-amber-100', 'text-amber-800',
    'bg-rose-100', 'text-rose-800',
  );
  if (category && completeInputs && current && analysis?.status === 'complete') {
    elements.conditionLabel.textContent = category.label;
    elements.conditionLabel.classList.add(...category.className.split(' '));
    elements.conditionSymbol.textContent = category.symbol;
    elements.conditionDescription.textContent = category.description;
    return;
  }

  elements.conditionLabel.textContent = 'Menunggu data sensor.';
  elements.conditionLabel.classList.add('bg-slate-100', 'text-slate-700');
  elements.conditionSymbol.textContent = 'info';
  if (!current) {
    elements.conditionDescription.textContent = 'Menunggu data sensor.';
  } else if (!completeInputs) {
    elements.conditionDescription.textContent = 'Menunggu data sensor. Diagnosis memerlukan data valid suhu, pH, dan kekeruhan.';
  } else {
    elements.conditionDescription.textContent =
      analysis?.message || 'Fuzzy Logic belum dikonfigurasi pada backend; diagnosis kualitas air belum tersedia.';
  }
}

function setSeries(path, point, history, getValue) {
  const values = history.map(getValue);
  const presentValues = values.filter((value) => value !== null && Number.isFinite(value));
  if (!presentValues.length) {
    path.setAttribute('d', '');
    point.setAttribute('visibility', 'hidden');
    return;
  }

  const minimum = Math.min(...presentValues);
  const maximum = Math.max(...presentValues);
  const spread = maximum - minimum || 1;
  const commands = [];
  const coordinates = [];
  let needsMove = true;
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      needsMove = true;
      return;
    }
    const x = history.length === 1 ? 250 : (index / (history.length - 1)) * 500;
    const y = 130 - ((value - minimum) / spread) * 110;
    commands.push(`${needsMove ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    coordinates.push({ x, y });
    needsMove = false;
  });
  path.setAttribute('d', commands.join(' '));
  if (coordinates.length === 1) {
    point.setAttribute('cx', coordinates[0].x.toFixed(1));
    point.setAttribute('cy', coordinates[0].y.toFixed(1));
    point.setAttribute('visibility', 'visible');
  } else {
    point.setAttribute('visibility', 'hidden');
  }
}

function renderChart(history) {
  setSeries(elements.temperatureSeries, elements.temperaturePoint, history, (sample) => sample.temperature_c);
  setSeries(elements.phSeries, elements.phPoint, history, (sample) => sample.ph);
  setSeries(elements.turbiditySeries, elements.turbidityPoint, history, (sample) => sample.turbidity_kal);
  elements.sampleCount.textContent = `${history.length} sampel`;
  elements.chartDescription.textContent = history.length
    ? `Riwayat aktual: ${formatTime(history[0].receivedAt)}–${formatTime(history[history.length - 1].receivedAt)} WIB. Skala tiap seri mandiri.`
    : 'Belum ada pembacaan sensor.';
  elements.chartStartTime.textContent = history.length ? formatTime(history[0].receivedAt) : '—';
  elements.chartEndTime.textContent = history.length
    ? `${formatTime(history[history.length - 1].receivedAt)} WIB (terakhir)`
    : '—';
}

function appendCell(row, value, className = '') {
  const cell = document.createElement('td');
  cell.className = `py-2.5 ${className}`.trim();
  cell.textContent = value;
  row.append(cell);
}

function renderLog(history) {
  const latest = history.slice(-MAX_LOG_ROWS).reverse();
  elements.logBody.replaceChildren();

  if (!latest.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'py-2.5 text-slate-400';
    cell.colSpan = 5;
    cell.textContent = 'Belum ada pembacaan sensor.';
    row.append(cell);
    elements.logBody.append(row);
    return;
  }

  for (const sample of latest) {
    const row = document.createElement('tr');
    appendCell(row, formatTime(sample.receivedAt), 'font-medium');
    appendCell(row, sample.temperature_c === null ? '—' : `${sample.temperature_c.toFixed(2)}°C`, 'text-sky-600 break-words');
    appendCell(row, sample.ph === null || !Number.isFinite(sample.ph) ? '—' : sample.ph.toFixed(2), 'text-emerald-700');
    const turbidity = sample.turbidity_adc === null || sample.turbidity_adc === undefined
      ? '—'
      : `${sample.turbidity_adc}/${Number.isFinite(sample.turbidity_kal) ? sample.turbidity_kal.toFixed(2) : '—'}`;
    appendCell(row, turbidity, 'break-words');
    const sensorSummary = `Suhu ${sample.temperature_valid ? 'OK' : 'gagal'} · pH ${sample.ph_valid ? 'OK' : 'belum tersedia'} · Turbidity ${sample.turbidity_valid ? 'OK' : 'gagal'}`;
    appendCell(row, sensorSummary, 'break-words');
    elements.logBody.append(row);
  }
}

export function createDashboardUI() {
  function renderOnline(readings, history) {
    const hasReading = Boolean(readings.received_at);
    const current = readings.esp32_online && readings.data_fresh;
    const receivedAt = hasReading ? new Date(readings.received_at) : null;
    const ageLabel = Number.isFinite(readings.age_seconds)
      ? ` · ${Math.floor(readings.age_seconds)} dtk lalu`
      : '';
    const stateLabel = current
      ? 'ESP32 Online'
      : hasReading && !readings.data_fresh
        ? 'Data Kedaluwarsa'
        : 'ESP32 Offline';
    setConnectionStatus(
      current,
      `${readings.serial_connected ? 'Serial terhubung' : 'Serial terputus'}${hasReading ? `; data terakhir ${readings.received_at}` : ''}`,
      stateLabel,
    );
    elements.lastUpdated.textContent = receivedAt
      ? `${formatTime(receivedAt)} WIB${!readings.data_fresh ? ' · Kedaluwarsa' : ageLabel}`
      : 'Belum ada';

    if (readings.temperature_valid) {
      elements.temperatureValue.textContent = readings.temperature_c.toFixed(2);
      setSensorLabel(
        elements.temperatureStatus,
        current ? 'Data diterima' : 'Data terakhir',
        current ? 'good' : 'warning',
      );
      elements.temperatureTrend.textContent = current ? 'Pembacaan langsung' : 'Nilai terakhir diterima';
    } else {
      elements.temperatureValue.textContent = '—';
      setSensorLabel(
        elements.temperatureStatus,
        hasReading ? 'Sensor gagal dibaca' : 'Data tidak tersedia',
        hasReading ? 'bad' : 'unknown',
      );
      elements.temperatureTrend.textContent = hasReading ? 'Nilai tidak ditampilkan' : 'Menunggu pembacaan';
    }

    if (readings.ph_valid) {
      elements.phValue.textContent = readings.ph.toFixed(2);
      elements.phStatus.textContent = 'Data diterima';
      elements.phStatus.className = 'sensor-status px-2 py-0.5 rounded-full text-[11px] font-semibold border sensor-good';
    } else {
      elements.phValue.textContent = '—';
      elements.phStatus.textContent = 'Menunggu kalibrasi';
      elements.phStatus.className = 'sensor-status px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-50 text-slate-600 border border-slate-200 sensor-unknown';
    }

    if (readings.turbidity_valid) {
      elements.turbidityAdc.textContent = String(readings.turbidity_adc);
      elements.turbidityKal.textContent = String(readings.turbidity_kal);
      elements.turbidityClassification.textContent = current ? 'Terbaca' : 'Data terakhir';
      setSensorLabel(
        elements.turbidityStatus,
        current ? 'Data diterima' : 'Data terakhir',
        current ? 'good' : 'warning',
      );
    } else {
      elements.turbidityAdc.textContent = '—';
      elements.turbidityKal.textContent = '—';
      elements.turbidityClassification.textContent = 'Belum tersedia';
      setSensorLabel(
        elements.turbidityStatus,
        hasReading ? 'Sensor gagal dibaca' : 'Data tidak tersedia',
        hasReading ? 'bad' : 'unknown',
      );
    }

    const pumpCommandedOn = readings.pump_status === 'ON' && current;
    elements.pumpStatus.textContent = pumpCommandedOn
      ? 'Always ON'
      : readings.pump_status === 'ON' && hasReading
        ? 'Terakhir ON'
        : 'Status tidak diketahui';
    elements.pumpStatus.classList.toggle('text-emerald-600', pumpCommandedOn);
    elements.pumpStatus.classList.toggle('text-slate-500', !pumpCommandedOn);
    renderDiagnosis(readings);
    renderChart(history);
    renderLog(history);
    const firebaseState = readings.firebase?.pending_writes > 0
      ? `Firebase antrean ${readings.firebase.pending_writes}`
      : readings.firebase?.connected === true
        ? 'Firebase aktif'
        : readings.firebase?.initialized
          ? 'Firebase belum terverifikasi'
          : 'Firebase belum dikonfigurasi';
    elements.logStatus.textContent = `Backend aktif · Serial ${readings.serial_connected ? 'terhubung' : 'terputus'} · ${firebaseState}`;
    elements.logStatus.className = readings.serial_connected
      && readings.firebase?.connected === true
      && readings.firebase?.pending_writes === 0
      ? 'text-emerald-600 font-semibold flex items-center gap-1'
      : 'text-amber-600 font-semibold flex items-center gap-1';
  }

  function renderOffline(errorMessage, timedOut = false, lastReadings = null) {
    setConnectionStatus(false, errorMessage);
    const hasReading = Boolean(lastReadings?.received_at);
    elements.temperatureValue.textContent = lastReadings?.temperature_valid
      ? lastReadings.temperature_c.toFixed(2)
      : '—';
    setSensorLabel(
      elements.temperatureStatus,
      lastReadings?.temperature_valid ? 'Data kedaluwarsa' : hasReading ? 'Sensor gagal dibaca' : 'Data tidak tersedia',
      lastReadings?.temperature_valid ? 'warning' : 'unknown',
    );
    elements.temperatureTrend.textContent = hasReading ? 'Backend tidak dapat diperbarui' : 'Menunggu koneksi backend';
    elements.phValue.textContent = '—';
    elements.phStatus.textContent = 'Menunggu kalibrasi';
    elements.phStatus.className = 'sensor-status px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-50 text-slate-600 border border-slate-200 sensor-unknown';
    elements.turbidityAdc.textContent = lastReadings?.turbidity_valid ? String(lastReadings.turbidity_adc) : '—';
    elements.turbidityKal.textContent = lastReadings?.turbidity_valid ? String(lastReadings.turbidity_kal) : '—';
    elements.turbidityClassification.textContent = lastReadings?.turbidity_valid ? 'Data kedaluwarsa' : 'Belum tersedia';
    setSensorLabel(
      elements.turbidityStatus,
      lastReadings?.turbidity_valid ? 'Data kedaluwarsa' : hasReading ? 'Sensor gagal dibaca' : 'Data tidak tersedia',
      lastReadings?.turbidity_valid ? 'warning' : 'unknown',
    );
    elements.pumpStatus.textContent = lastReadings?.pump_status === 'ON' ? 'Terakhir ON' : 'Perintah tidak terverifikasi';
    elements.pumpStatus.classList.remove('text-emerald-600');
    elements.pumpStatus.classList.add('text-slate-500');
    elements.conditionLabel.textContent = 'Menunggu data sensor.';
    elements.conditionLabel.classList.remove(
      'bg-emerald-100', 'text-emerald-800',
      'bg-amber-100', 'text-amber-800',
      'bg-rose-100', 'text-rose-800',
    );
    elements.conditionLabel.classList.add('bg-slate-100', 'text-slate-700');
    elements.conditionSymbol.textContent = 'wifi_off';
    elements.conditionDescription.textContent =
      'Menunggu data sensor. Status koneksi tidak menentukan kategori kualitas air.';
    elements.lastUpdated.textContent = hasReading
      ? `${formatTime(lastReadings.received_at)} WIB · Backend offline`
      : 'Tidak terhubung';
    const reason = timedOut ? 'Waktu tunggu backend habis' : 'Backend tidak dapat dijangkau';
    elements.logStatus.textContent = `Offline: ${reason}`;
    elements.logStatus.title = errorMessage;
    elements.logStatus.className = 'text-rose-600 font-semibold flex items-center gap-1';
  }

  return { renderOnline, renderOffline };
}
