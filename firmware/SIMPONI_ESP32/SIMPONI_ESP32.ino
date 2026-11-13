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

// Batas turbidity berdasarkan hasil pengukuran terbaru
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

  // Relay aktif LOW
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW); // ON

  analogReadResolution(12);

  analogSetPinAttenuation(PH_PIN, ADC_11db);
  analogSetPinAttenuation(TURBIDITY_PIN, ADC_11db);

  pinMode(PH_PIN, INPUT);
  pinMode(TURBIDITY_PIN, INPUT);

  sensors.begin();

  Serial.println("MONITORING AQUAPONIK");
  Serial.println("Mode: Monitoring dengan relay ON");
  Serial.println("Relay: ON");
}

void loop() {
  float adcPH = bacaADC(PH_PIN, 100);
  float adcTurbidity = bacaADC(TURBIDITY_PIN, 30);

  float ph = hitungPH(adcPH);

  sensors.requestTemperatures();
  float suhu = sensors.getTempCByIndex(0);

  Serial.println("\n====== MONITORING AQUAPONIK ======");

  Serial.print("ADC pH       : ");
  Serial.println(adcPH, 2);

  Serial.print("Nilai pH     : ");
  if (isnan(ph)) {
    Serial.println("Di luar rentang kalibrasi");
  } else {
    Serial.println(ph, 2);
  }

  Serial.print("Status pH    : ");
  Serial.println(statusPH(ph));

  Serial.print("ADC Turbidity: ");
  Serial.println(adcTurbidity, 2);

  Serial.print("Status Air   : ");
  Serial.println(statusTurbidity(adcTurbidity));

  Serial.print("Suhu Air     : ");
  if (suhu == DEVICE_DISCONNECTED_C) {
    Serial.println("Sensor tidak terdeteksi");
  } else {
    Serial.print(suhu, 2);
    Serial.println(" C");
  }

  Serial.println("Relay        : ON");
  Serial.println("Pompa        : ON (jika rangkaian daya terpasang)");
  Serial.println("==================================");

  delay(2000);
}
