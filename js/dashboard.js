
import {
  MAX_HISTORY_SAMPLES,
  POLL_INTERVAL_MS,
  SENSOR_INTERVAL_SECONDS
} from './config.js';

import {
  fetchSensorHistory,
  fetchSensorReadings
} from './sensor-api.js';

import { createDashboardUI } from './dashboard-ui.js';

const ui = createDashboardUI();
const history = [];

let lastReadings = null;
let requestInProgress = false;

const refreshButton = document.getElementById('refresh-sensors');
const refreshTimeButton = document.getElementById('refresh-time');
const sensorIntervalElement = document.getElementById('sensor-interval');
const dashboardIntervalElement = document.getElementById('dashboard-interval');

const sensorIntervalLabel = SENSOR_INTERVAL_SECONDS % 60 === 0
  ? `Setiap ${SENSOR_INTERVAL_SECONDS / 60} menit`
  : `Setiap ${SENSOR_INTERVAL_SECONDS} detik`;

sensorIntervalElement.textContent = sensorIntervalLabel;
dashboardIntervalElement.textContent =
  `Setiap ${POLL_INTERVAL_MS / 1000} detik`;

async function refreshDashboard() {
  if (requestInProgress) return;

  requestInProgress = true;
  refreshButton.disabled = true;
  refreshTimeButton.disabled = true;

  try {
    // Ambil data sensor terbaru terlebih dahulu.
    const readings = await fetchSensorReadings();

    // Simpan pembacaan terakhir.
    lastReadings = readings.received_at
      ? readings
      : lastReadings;

    // Tambahkan data terbaru ke riwayat lokal.
    if (
      readings.received_at &&
      !history.some(sample =>
        sample.record_id === readings.record_id
      )
    ) {
      history.push({
        ...readings,
        receivedAt: new Date(readings.received_at),
      });

      if (history.length > MAX_HISTORY_SAMPLES) {
        history.shift();
      }
    }

    // Tampilkan data sensor terlebih dahulu.
    // Kegagalan Firebase tidak boleh membuat dashboard Offline.
    ui.renderOnline(readings, history);

    // Ambil riwayat Firebase secara terpisah.
    if (readings.firebase?.initialized) {
      try {
        const savedHistory = await fetchSensorHistory();

        if (savedHistory.available) {
          ui.renderOnline(readings, savedHistory.readings);
        }
      } catch (error) {
        console.warn(
          'Riwayat Firebase gagal diperbarui:',
          error
        );
      }
    }

  } catch (error) {
    console.warn(
      'Gagal menerima data aktual dari Flask Backend:',
      error
    );

    const errorMessage = error instanceof Error
      ? error.message
      : String(error);

    ui.renderOffline(
      errorMessage,
      error instanceof Error && error.name === 'AbortError',
      lastReadings
    );

  } finally {
    requestInProgress = false;
    refreshButton.disabled = false;
    refreshTimeButton.disabled = false;
  }
}

refreshButton.addEventListener('click', refreshDashboard);
refreshTimeButton.addEventListener('click', refreshDashboard);

refreshDashboard();

window.setInterval(
  refreshDashboard,
  POLL_INTERVAL_MS
);
