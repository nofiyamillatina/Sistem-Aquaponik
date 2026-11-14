
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
  phClassification: requiredElement('ph-classification'),

  turbidityAdc: requiredElement('turbidity-adc'),
  turbidityKal: requiredElement('turbidity-kal'),
  turbidityStatus: requiredElement('turbidity-status'),
  turbidityClassification: requiredElement('turbidity-classification'),

  pumpStatus: requiredElement('pump-status'),

  conditionLabel: requiredElement('water-condition-label'),
  conditionDescription: requiredElement('water-condition-description'),
  conditionSymbol: requiredElement('water-condition-symbol'),
  recommendationSummary: requiredElement('recommendation-summary'),
  recommendationIssues: requiredElement('recommendation-issues'),
  pumpRecommendation: requiredElement('pump-recommendation'),

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

  element.classList.remove(
    'sensor-good',
    'sensor-warning',
    'sensor-bad',
    'sensor-unknown'
  );

  element.classList.add(`sensor-${state}`);
}

// BADGE KLASIFIKASI SENSOR
function setClassificationBadge(element, label, type, current = true) {
  const colors = {
    ph: {
      Asam: 'bg-rose-100 text-rose-700 border border-rose-200',
      Netral: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
      Basa: 'bg-sky-100 text-sky-700 border border-sky-200',
    },
    turbidity: {
      Jernih: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
      Keruh: 'bg-amber-100 text-amber-700 border border-amber-200',
      'Sangat Keruh': 'bg-rose-100 text-rose-700 border border-rose-200',
    },
  };

  const color = colors[type]?.[label];

  element.textContent = label;
  element.className =
    'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ' +
    (color && current
      ? color
      : 'bg-slate-100 text-slate-500 border border-slate-200');
}

function classifyPh(value) {
  if (!Number.isFinite(value)) return 'Belum tersedia';

  const membership = (x, [a, b, c, d]) => {
    if (b <= x && x <= c) return 1;
    if (x <= a || x >= d) return 0;
    if (x < b) return a === b ? 1 : (x - a) / (b - a);
    return c === d ? 1 : (d - x) / (d - c);
  };

  const degrees = {
    Asam: membership(value, [0, 0, 5, 6.5]),
    Netral: membership(value, [6, 6.5, 8, 8.5]),
    Basa: membership(value, [8, 8.5, 14, 14]),
  };

  return Object.entries(degrees)
    .sort((a, b) => b[1] - a[1])[0][0];
}

function classifyTurbidity(adc) {
  if (!Number.isFinite(adc)) return 'Belum tersedia';
  if (adc > 1155) return 'Jernih';
  if (adc >= 941) return 'Keruh';
  return 'Sangat Keruh';
}

function setConnectionStatus(online, details = '', label = '') {
  elements.connectionIndicator.classList.toggle(
    'connection-online',
    online
  );

  elements.connectionIndicator.classList.toggle(
    'connection-offline',
    !online
  );

  elements.connectionStatus.textContent =
    label || (online ? 'ESP32 Online' : 'ESP32 Offline');

  elements.connectionIndicator.title = details;
}

function renderDiagnosis(readings) {
  const analysis = readings.analysis;

  const completeInputs =
    readings.temperature_valid === true &&
    readings.ph_valid === true &&
    readings.turbidity_valid === true;

  const current =
    readings.esp32_online === true &&
    readings.data_fresh === true;

  const label = String(analysis?.diagnosis?.label || '')
    .trim()
    .toLowerCase();

  const categories = {
    baik: {
      label: 'Baik',
      className: 'bg-emerald-100 text-emerald-800',
      symbol: 'check_circle',
      description: 'Kondisi kualitas air berdasarkan ketiga parameter sensor tergolong baik.'
    },
    'perlu perhatian': {
      label: 'Perlu Perhatian',
      className: 'bg-amber-100 text-amber-800',
      symbol: 'info',
      description: 'Kondisi kualitas air perlu dipantau agar tetap mendukung ekosistem aquaponik.'
    },
    buruk: {
      label: 'Buruk',
      className: 'bg-rose-100 text-rose-800',
      symbol: 'warning',
      description: 'Kondisi kualitas air memerlukan evaluasi untuk menjaga kesehatan ikan dan tanaman.'
    },
  };

  elements.conditionLabel.classList.remove(
    'bg-slate-100', 'text-slate-700',
    'bg-emerald-100', 'text-emerald-800',
    'bg-amber-100', 'text-amber-800',
    'bg-rose-100', 'text-rose-800'
  );

  if (
    current &&
    completeInputs &&
    analysis?.status === 'complete' &&
    categories[label]
  ) {
    const category = categories[label];

    elements.conditionLabel.textContent = category.label;
    elements.conditionLabel.classList.add(
      ...category.className.split(' ')
    );

    elements.conditionSymbol.textContent = category.symbol;
    elements.conditionDescription.textContent = category.description;

    return;
  }

  elements.conditionLabel.textContent = 'Belum Ditentukan';
  elements.conditionLabel.classList.add(
    'bg-slate-100',
    'text-slate-700'
  );

  elements.conditionSymbol.textContent = 'info';

  if (!current) {
    elements.conditionDescription.textContent =
      'Menunggu data sensor terbaru.';
  } else if (!completeInputs) {
    elements.conditionDescription.textContent =
      'Diagnosis belum dapat ditentukan karena satu atau lebih parameter sensor belum valid. Nilai pH yang berada di luar rentang kalibrasi tidak digunakan dalam proses fuzzy.';
  } else {
    elements.conditionDescription.textContent =
      analysis?.message || 'Diagnosis fuzzy belum tersedia.';
  }
}

function renderRecommendation(readings) {
  const recommendation = readings.analysis?.recommendation;

  const current =
    readings.esp32_online === true &&
    readings.data_fresh === true &&
    readings.analysis?.status === 'complete';

  elements.recommendationIssues.replaceChildren();

  if (!current || !recommendation) {
    elements.recommendationSummary.textContent =
      'Rekomendasi belum tersedia karena data sensor belum lengkap atau sudah kedaluwarsa.';

    elements.pumpRecommendation.textContent =
      'Pompa tetap dikonfigurasikan Always ON.';

    return;
  }

  elements.recommendationSummary.textContent =
    recommendation.summary ||
      'Rekomendasi belum tersedia.';

  const issues = Array.isArray(recommendation.issues)
    ? recommendation.issues
    : [];

  if (!issues.length) {
    const message = document.createElement('p');
    message.className = 'text-sm text-emerald-700';
    message.textContent =
      'Tidak ditemukan parameter yang memerlukan perhatian khusus berdasarkan batas pemeriksaan rekomendasi.';

    elements.recommendationIssues.append(message);
  }

  for (const issue of issues) {
    const item = document.createElement('div');
    item.className =
      'rounded-lg border border-amber-200 bg-amber-50 p-3';

    const title = document.createElement('p');
    title.className = 'text-sm font-bold text-amber-800';
    title.textContent =
      `${issue.parameter}: ${issue.condition}`;

    const description = document.createElement('p');
    description.className = 'mt-1 text-sm text-slate-600';
    description.textContent = issue.recommendation;

    item.append(title, description);
    elements.recommendationIssues.append(item);
  }

  elements.pumpRecommendation.textContent =
    recommendation.pump_recommendation ||
    'Pompa tetap ON untuk menjaga sirkulasi air.';
}

function setSeries(path, point, history, getValue) {
  const values = history.map(getValue);

  const presentValues = values.filter(
    value => value !== null && Number.isFinite(value)
  );

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

    const x = history.length === 1
      ? 250
      : (index / (history.length - 1)) * 500;

    const y = 130 - ((value - minimum) / spread) * 110;

    commands.push(
      `${needsMove ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    );

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
  setSeries(
    elements.temperatureSeries,
    elements.temperaturePoint,
    history,
    sample => sample.temperature_c
  );

  setSeries(
    elements.phSeries,
    elements.phPoint,
    history,
    sample => sample.ph
  );

  setSeries(
    elements.turbiditySeries,
    elements.turbidityPoint,
    history,
    sample => sample.turbidity_adc
  );

  elements.sampleCount.textContent = `${history.length} sampel`;

  elements.chartDescription.textContent = history.length
    ? `Riwayat aktual: ${formatTime(history[0].receivedAt)}–${formatTime(history[history.length - 1].receivedAt)} WIB. Skala tiap seri mandiri.`
    : 'Belum ada pembacaan sensor.';

  elements.chartStartTime.textContent = history.length
    ? formatTime(history[0].receivedAt)
    : '—';

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

    appendCell(
      row,
      sample.temperature_c === null
        ? '—'
        : `${sample.temperature_c.toFixed(2)}°C`,
      'text-sky-600 break-words'
    );

    appendCell(
      row,
      sample.ph === null || !Number.isFinite(sample.ph)
        ? 'Belum terukur (di luar kalibrasi)'
        : `${sample.ph.toFixed(2)} (${classifyPh(sample.ph)})`,
      'text-emerald-700'
    );

    const turbidity = sample.turbidity_valid
      ? `${sample.turbidity_adc} (${classifyTurbidity(sample.turbidity_adc)})`
      : '—';

    appendCell(row, turbidity, 'break-words');

    const sensorSummary =
      `Suhu ${sample.temperature_valid ? 'OK' : 'gagal'} · ` +
      `pH ${sample.ph_valid ? 'OK' : 'di luar kalibrasi'} · ` +
      `Turbidity ${sample.turbidity_valid ? 'OK' : 'gagal'}`;

    appendCell(row, sensorSummary, 'break-words');

    elements.logBody.append(row);
  }
}

export function createDashboardUI() {

  function renderOnline(readings, history) {
    const hasReading = Boolean(readings.received_at);

    const current =
      readings.esp32_online &&
      readings.data_fresh;

    const receivedAt = hasReading
      ? new Date(readings.received_at)
      : null;

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
      stateLabel
    );

    elements.lastUpdated.textContent = receivedAt
      ? `${formatTime(receivedAt)} WIB${!readings.data_fresh ? ' · Kedaluwarsa' : ageLabel}`
      : 'Belum ada';

    // SUHU
    if (readings.temperature_valid) {
      elements.temperatureValue.textContent =
        readings.temperature_c.toFixed(2);

      setSensorLabel(
        elements.temperatureStatus,
        current ? 'Data diterima' : 'Data terakhir',
        current ? 'good' : 'warning'
      );

      elements.temperatureTrend.textContent = current
        ? 'Pembacaan langsung'
        : 'Nilai terakhir diterima';
    } else {
      elements.temperatureValue.textContent = '—';

      setSensorLabel(
        elements.temperatureStatus,
        hasReading ? 'Sensor gagal dibaca' : 'Data tidak tersedia',
        hasReading ? 'bad' : 'unknown'
      );

      elements.temperatureTrend.textContent = hasReading
        ? 'Nilai tidak ditampilkan'
        : 'Menunggu pembacaan';
    }

    // pH
    if (readings.ph_valid && Number.isFinite(readings.ph)) {
      elements.phValue.textContent =
        readings.ph.toFixed(2);

      setSensorLabel(
        elements.phStatus,
        current ? 'Data diterima' : 'Data kedaluwarsa',
        current ? 'good' : 'warning'
      );

      setClassificationBadge(
        elements.phClassification,
        classifyPh(readings.ph),
        'ph',
        current
      );
    } else {
      elements.phValue.textContent = 'Belum terukur';

      setSensorLabel(
        elements.phStatus,
        current ? 'Perlu verifikasi' : 'Data tidak tersedia',
        current ? 'warning' : 'unknown'
      );

      setClassificationBadge(
        elements.phClassification,
        current ? 'Di luar rentang kalibrasi' : 'Menunggu pembacaan',
        'ph',
        false
      );
    }

    // TURBIDITY
    if (readings.turbidity_valid) {
      const classification =
        classifyTurbidity(readings.turbidity_adc);

      elements.turbidityAdc.textContent =
        String(readings.turbidity_adc);

      setClassificationBadge(
        elements.turbidityKal,
        classification,
        'turbidity',
        current
      );

      elements.turbidityClassification.textContent =
        current ? 'Terbaca' : 'Data terakhir';

      const state = classification === 'Jernih'
        ? 'good'
        : classification === 'Keruh'
          ? 'warning'
          : 'bad';

      setSensorLabel(
        elements.turbidityStatus,
        current ? 'Data diterima' : 'Data terakhir',
        current ? state : 'warning'
      );
    } else {
      elements.turbidityAdc.textContent = '—';

      setClassificationBadge(
        elements.turbidityKal,
        'Belum tersedia',
        'turbidity',
        false
      );

      elements.turbidityClassification.textContent =
        'Belum tersedia';

      setSensorLabel(
        elements.turbidityStatus,
        hasReading ? 'Sensor gagal dibaca' : 'Data tidak tersedia',
        hasReading ? 'bad' : 'unknown'
      );
    }

    // POMPA
    const pumpCommandedOn =
      readings.pump_status === 'ON' && current;

    elements.pumpStatus.textContent = pumpCommandedOn
      ? 'Always ON'
      : readings.pump_status === 'ON' && hasReading
        ? 'Terakhir ON'
        : 'Status tidak diketahui';

    elements.pumpStatus.classList.toggle(
      'text-emerald-600',
      pumpCommandedOn
    );

    elements.pumpStatus.classList.toggle(
      'text-slate-500',
      !pumpCommandedOn
    );

    // DIAGNOSIS, GRAFIK, DAN RIWAYAT
    renderDiagnosis(readings);
    renderRecommendation(readings);
    renderChart(history);
    renderLog(history);

    const firebaseState =
      readings.firebase?.pending_writes > 0
        ? `Firebase antrean ${readings.firebase.pending_writes}`
        : readings.firebase?.connected === true
          ? 'Firebase aktif'
          : readings.firebase?.initialized
            ? 'Firebase belum terverifikasi'
            : 'Firebase belum dikonfigurasi';

    elements.logStatus.textContent =
      `Backend aktif · Serial ${readings.serial_connected ? 'terhubung' : 'terputus'} · ${firebaseState}`;

    elements.logStatus.className =
      readings.serial_connected &&
      readings.firebase?.connected === true &&
      readings.firebase?.pending_writes === 0
        ? 'text-emerald-600 font-semibold flex items-center gap-1'
        : 'text-amber-600 font-semibold flex items-center gap-1';
  }

  function renderOffline(
    errorMessage,
    timedOut = false,
    lastReadings = null
  ) {
    setConnectionStatus(false, errorMessage);

    const hasReading =
      Boolean(lastReadings?.received_at);

    // SUHU
    elements.temperatureValue.textContent =
      lastReadings?.temperature_valid
        ? lastReadings.temperature_c.toFixed(2)
        : '—';

    setSensorLabel(
      elements.temperatureStatus,
      lastReadings?.temperature_valid
        ? 'Data kedaluwarsa'
        : hasReading
          ? 'Sensor gagal dibaca'
          : 'Data tidak tersedia',
      lastReadings?.temperature_valid ? 'warning' : 'unknown'
    );

    elements.temperatureTrend.textContent = hasReading
      ? 'Backend tidak dapat diperbarui'
      : 'Menunggu koneksi backend';

    // pH
    const phAvailable =
      lastReadings?.ph_valid === true &&
      Number.isFinite(lastReadings?.ph);

    elements.phValue.textContent =
      phAvailable
        ? lastReadings.ph.toFixed(2)
        : lastReadings?.ph_valid === false && hasReading
          ? 'Belum terukur'
          : '—';

    setSensorLabel(
      elements.phStatus,
      phAvailable
        ? 'Data kedaluwarsa'
        : hasReading
          ? 'Perlu verifikasi'
          : 'Data tidak tersedia',
      phAvailable ? 'warning' : 'unknown'
    );

    setClassificationBadge(
      elements.phClassification,
      phAvailable
        ? classifyPh(lastReadings.ph)
        : hasReading
          ? 'Di luar rentang kalibrasi'
          : 'Belum tersedia',
      'ph',
      false
    );

    // TURBIDITY
    const hasTurbidity =
      lastReadings?.turbidity_valid === true;

    elements.turbidityAdc.textContent =
      hasTurbidity
        ? String(lastReadings.turbidity_adc)
        : '—';

    setClassificationBadge(
      elements.turbidityKal,
      hasTurbidity
        ? classifyTurbidity(lastReadings.turbidity_adc)
        : 'Belum tersedia',
      'turbidity',
      false
    );

    elements.turbidityClassification.textContent =
      hasTurbidity ? 'Data kedaluwarsa' : 'Belum tersedia';

    setSensorLabel(
      elements.turbidityStatus,
      hasTurbidity
        ? 'Data kedaluwarsa'
        : hasReading
          ? 'Sensor gagal dibaca'
          : 'Data tidak tersedia',
      hasTurbidity ? 'warning' : 'unknown'
    );

    // POMPA
    elements.pumpStatus.textContent =
      lastReadings?.pump_status === 'ON'
        ? 'Terakhir ON'
        : 'Perintah tidak terverifikasi';

    elements.pumpStatus.classList.remove('text-emerald-600');
    elements.pumpStatus.classList.add('text-slate-500');

    // DIAGNOSIS
    elements.conditionLabel.textContent = 'Menunggu data sensor.';

    elements.conditionLabel.classList.remove(
      'bg-emerald-100', 'text-emerald-800',
      'bg-amber-100', 'text-amber-800',
      'bg-rose-100', 'text-rose-800'
    );

    elements.conditionLabel.classList.add(
      'bg-slate-100',
      'text-slate-700'
    );

    elements.conditionSymbol.textContent = 'wifi_off';

    elements.conditionDescription.textContent =
      'Menunggu data sensor. Status koneksi tidak menentukan kategori kualitas air.';

    elements.lastUpdated.textContent = hasReading
      ? `${formatTime(lastReadings.received_at)} WIB · Backend offline`
      : 'Tidak terhubung';

    const reason = timedOut
      ? 'Waktu tunggu backend habis'
      : 'Backend tidak dapat dijangkau';

    elements.logStatus.textContent =
      `Offline: ${reason}`;

    elements.logStatus.title = errorMessage;

    elements.logStatus.className =
      'text-rose-600 font-semibold flex items-center gap-1';

    elements.recommendationSummary.textContent =
      'Rekomendasi belum tersedia karena koneksi backend terputus atau data kedaluwarsa.';

    elements.recommendationIssues.replaceChildren();

    elements.pumpRecommendation.textContent =
      'Pompa tetap dikonfigurasikan Always ON.';
  }

  return {
    renderOnline,
    renderOffline,
  };
}
