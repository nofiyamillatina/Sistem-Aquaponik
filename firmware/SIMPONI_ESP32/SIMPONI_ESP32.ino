
#include <Arduino.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <math.h>

#define PH_PIN 35
#define TURBIDITY_PIN 34
#define ONE_WIRE_BUS 14
#define RELAY_PIN 32

// Kalibrasi pH tiga titik
const float ADC_ASAM = 1487.33;
const float PH_ASAM = 4.01;

const float ADC_NETRAL = 1384.54;
const float PH_NETRAL = 6.86;

const float ADC_BASA = 1311.74;
const float PH_BASA = 9.18;

// Batas turbidity
const float BATAS_JERNIH = 1155;
const float BATAS_KERUH = 941;

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

float bacaADC(int pin, int jumlah) {
  long total = 0;

  for (int i = 0; i < jumlah; i++) {
    total += analogRead(pin);
    delay(10);
  }

  return total / (float)jumlah;
}

float hitungPH(float adc) {
  if (adc < ADC_BASA || adc > ADC_ASAM) {
    return NAN;
  }

  if (adc >= ADC_NETRAL) {
    return PH_NETRAL +
      ((PH_ASAM - PH_NETRAL) /
      (ADC_ASAM - ADC_NETRAL)) *
      (adc - ADC_NETRAL);
  }

  return PH_NETRAL +
    ((PH_BASA - PH_NETRAL) /
    (ADC_BASA - ADC_NETRAL)) *
    (adc - ADC_NETRAL);
}

String statusPH(float ph) {
  if (isnan(ph)) return "Di luar kalibrasi";
  if (ph < 6.5) return "Asam";
  if (ph <= 8.5) return "Normal";
  return "Basa";
}

String statusTurbidity(float adc) {
  if (adc >= 4090) return "ADC SATURASI";
  if (adc > BATAS_JERNIH) return "Jernih";
  if (adc >= BATAS_KERUH) return "Keruh";
  return "Sangat Keruh";
}

void setup() {
  Serial.begin(115200);

  // Relay aktif LOW, pompa selalu ON
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  analogReadResolution(12);

  analogSetPinAttenuation(PH_PIN, ADC_11db);
  analogSetPinAttenuation(TURBIDITY_PIN, ADC_11db);

  pinMode(PH_PIN, INPUT);
  pinMode(TURBIDITY_PIN, INPUT);

  sensors.begin();
}

void loop() {
  float adcPH = bacaADC(PH_PIN, 100);
  float adcTurbidity = bacaADC(TURBIDITY_PIN, 30);

  float ph = hitungPH(adcPH);

  sensors.requestTemperatures();
  float suhu = sensors.getTempCByIndex(0);

  bool temperatureValid =
    (suhu != DEVICE_DISCONNECTED_C && isfinite(suhu));

  bool turbidityValid =
    (adcTurbidity < 4090 && isfinite(adcTurbidity));

  bool phValid = isfinite(ph);

  String turbidityStatus = statusTurbidity(adcTurbidity);

  // Kirim data hanya dalam format JSON
  Serial.print("{");

  Serial.print("\"temperature_valid\":");
  Serial.print(temperatureValid ? "true" : "false");

  Serial.print(",\"temperature_c\":");
  if (temperatureValid) Serial.print(suhu, 2);
  else Serial.print("null");

  Serial.print(",\"turbidity_valid\":");
  Serial.print(turbidityValid ? "true" : "false");

  Serial.print(",\"turbidity_adc\":");
  if (turbidityValid) Serial.print((int)round(adcTurbidity));
  else Serial.print("null");

  Serial.print(",\"turbidity_status\":\"");
  if (turbidityValid) Serial.print(turbidityStatus);
  else Serial.print("null");
  Serial.print("\"");

  Serial.print(",\"ph_valid\":");
  Serial.print(phValid ? "true" : "false");

  Serial.print(",\"ph\":");
  if (phValid) Serial.print(ph, 2);
  else Serial.print("null");

  Serial.print(",\"pump_status\":\"ON\"");

  Serial.println("}");

  delay(2000);
}
