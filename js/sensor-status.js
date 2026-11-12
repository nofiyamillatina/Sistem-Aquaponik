
export function buildSensorStatus(readings) {
  const temperature = readings.temperature_valid ? 'Suhu terbaca' : 'Suhu gagal dibaca';
  const turbidity = readings.turbidity_valid ? 'Turbidity terbaca' : 'Turbidity gagal dibaca';
  const ph = readings.ph_valid ? 'pH terbaca' : 'pH belum tersedia';
  return `${temperature}; ${turbidity}; ${ph}`;
}
