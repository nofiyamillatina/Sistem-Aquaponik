#include <OneWire.h>
#include <DallasTemperature.h>
#include <math.h>
#include "config.h"

constexpr uint8_t DS18B20_PIN = 14;
constexpr uint8_t TURBIDITY_PIN = 34;
constexpr uint8_t RELAY_PIN = 32;

OneWire oneWire(DS18B20_PIN);
DallasTemperature temperatureSensor(&oneWire);
unsigned long lastReadingAt = 0;

void emitSensorReading() {
  temperatureSensor.requestTemperatures();
  const float temperatureC = temperatureSensor.getTempCByIndex(0);
  const bool temperatureValid =
      isfinite(temperatureC) && temperatureC != DEVICE_DISCONNECTED_C;

  const int turbidityAdc = analogRead(TURBIDITY_PIN);
  const float turbidityKal = (turbidityAdc - 2717.6f) / -18.189f;
  const bool turbidityValid =
      turbidityAdc >= 0 && turbidityAdc <= 4095 && isfinite(turbidityKal);

  Serial.print("{\"temperature_c\":");
  if (temperatureValid) {
    Serial.print(temperatureC, 2);
  } else {
    Serial.print("null");
  }
  Serial.print(",\"temperature_valid\":");
  Serial.print(temperatureValid ? "true" : "false");
  Serial.print(",\"turbidity_adc\":");
  if (turbidityValid) {
    Serial.print(turbidityAdc);
  } else {
    Serial.print("null");
  }
  Serial.print(",\"turbidity_kal\":");
  if (turbidityValid && isfinite(turbidityKal)) {
    Serial.print(turbidityKal, 2);
  } else {
    Serial.print("null");
  }
  Serial.print(",\"turbidity_valid\":");
  Serial.print(turbidityValid ? "true" : "false");
  Serial.print(",\"ph\":null,\"ph_valid\":false,\"pump_status\":\"ON\"");
  Serial.println("}");
}

void setup() {
  Serial.begin(115200);

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);
  analogReadResolution(12);
  temperatureSensor.begin();
  temperatureSensor.setResolution(12);

  Serial.println("# SIMPONI siap; pembacaan dikirim setiap 180000 ms.");
  lastReadingAt = millis() - SENSOR_INTERVAL_MS;
}

void loop() {
  const unsigned long now = millis();
  if (now - lastReadingAt >= SENSOR_INTERVAL_MS) {
    lastReadingAt = now;
    emitSensorReading();
  }
}
