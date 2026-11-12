import { MAX_HISTORY_SAMPLES, POLL_INTERVAL_MS, SENSOR_INTERVAL_SECONDS } from './config.js';
import { fetchSensorHistory, fetchSensorReadings } from './sensor-api.js';
import { createDashboardUI } from './dashboard-ui.js';

const ui = createDashboardUI();
const history = [];
let lastReadings = null;
const refreshButton = document.getElementById('refresh-sensors');
const refreshTimeButton = document.getElementById('refresh-time');
const sensorIntervalElement = document.getElementById('sensor-interval');
const dashboardIntervalElement = document.getElementById('dashboard-interval');
let requestInProgress = false;

const sensorIntervalLabel = SENSOR_INTERVAL_SECONDS % 60 === 0
  ? `Setiap ${SENSOR_INTERVAL_SECONDS / 60} menit`
  : `Setiap ${SENSOR_INTERVAL_SECONDS} detik`;
sensorIntervalElement.textContent = sensorIntervalLabel;
dashboardIntervalElement.textContent = `Setiap ${POLL_INTERVAL_MS / 1000} detik`;

async function refreshDashboard() {
  if (requestInProgress) return;
  requestInProgress = true;
  refreshButton.disabled = true;
  refreshTimeButton.disabled = true;

  try {
    const readings = await fetchSensorReadings();
    lastReadings = readings.received_at ? readings : lastReadings;
    if (readings.received_at && !history.some((sample) =>
      sample.record_id
        ? sample.record_id === readings.record_id
        : sample.receivedAt.toISOString() === new Date(readings.received_at).toISOString()
    )) {
      history.push({
        ...readings,
        receivedAt: new Date(readings.received_at),
      });
      if (history.length > MAX_HISTORY_SAMPLES) history.shift();
    }

    let displayedHistory = history;
    if (readings.firebase?.initialized) {
      try {
        const savedHistory = await fetchSensorHistory();
        if (savedHistory.available) {
          displayedHistory = savedHistory.readings;
        }
      } catch {
        // Keep the locally deduplicated readings visible while Firebase is unavailable.
      }
    }

    ui.renderOnline(readings, displayedHistory);
  } catch (error) {
    console.warn('Gagal menerima data aktual dari Flask Backend:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    ui.renderOffline(
      errorMessage,
      error instanceof Error && error.name === 'AbortError',
      lastReadings,
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
window.setInterval(refreshDashboard, POLL_INTERVAL_MS);
