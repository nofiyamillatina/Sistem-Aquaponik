"""Engine mechanics tests using synthetic, non-biological parameters only."""

import itertools
import unittest
from datetime import datetime, timezone

from backend.app import create_app
from backend.fuzzy_engine import (
    FUZZY_CONFIG,
    analyze,
    trapezoidal_membership,
    triangular_membership,
)


def _triangle(points):
    return {"type": "triangle", "points": points}


def _trapezoid(points):
    return {"type": "trapezoid", "points": points}


# Synthetic test fixture only: these numbers/rules are not calibrated, biological,
# recommended, or imported into the production FUZZY_CONFIG.
TEST_CONFIG = {
    "membership": {
        "temperature_c": {
            "Buruk": _trapezoid((0, 0, 18, 22)),
            "Perlu Perhatian": _triangle((18, 23, 27)),
            "Baik": _trapezoid((25, 28, 30, 33)),
        },
        "ph": {
            "Buruk": _trapezoid((0, 0, 5, 5.8)),
            "Perlu Perhatian": _triangle((5.5, 6.1, 6.7)),
            "Baik": _trapezoid((6.4, 7, 7.8, 8.5)),
        },
        "turbidity_kal": {
            "Baik": _trapezoid((0, 0, 45, 65)),
            "Perlu Perhatian": _triangle((50, 85, 120)),
            "Buruk": _trapezoid((110, 150, 300, 300)),
        },
        "output": {
            "Baik": _trapezoid((0, 0, 20, 45)),
            "Perlu Perhatian": _triangle((25, 50, 75)),
            "Buruk": _trapezoid((55, 80, 100, 100)),
        },
    },
    "rules": [],
    "output_domain": (0, 100, 1),
}

_severity = {"Baik": 0, "Perlu Perhatian": 1, "Buruk": 2}
for temperature_label, ph_label, turbidity_label in itertools.product(
    ("Baik", "Perlu Perhatian", "Buruk"),
    repeat=3,
):
    labels = (temperature_label, ph_label, turbidity_label)
    TEST_CONFIG["rules"].append({
        "if": {
            "temperature_c": temperature_label,
            "ph": ph_label,
            "turbidity_kal": turbidity_label,
        },
        "then": max(labels, key=_severity.get),
    })


def _reading(temperature, ph, turbidity):
    return {
        "temperature_c": temperature,
        "temperature_valid": True,
        "ph": ph,
        "ph_valid": True,
        "turbidity_kal": turbidity,
        "turbidity_valid": True,
    }


class MembershipTests(unittest.TestCase):
    def test_triangle_peak_and_overlap(self):
        self.assertEqual(triangular_membership(5, (0, 5, 10)), 1)
        self.assertAlmostEqual(triangular_membership(2.5, (0, 5, 10)), 0.5)
        self.assertEqual(triangular_membership(0, (0, 5, 10)), 0)

    def test_trapezoid_plateau_and_shoulders(self):
        self.assertEqual(trapezoidal_membership(0, (0, 0, 5, 10)), 1)
        self.assertEqual(trapezoidal_membership(5, (0, 0, 5, 10)), 1)
        self.assertAlmostEqual(trapezoidal_membership(7.5, (0, 0, 5, 10)), 0.5)
        self.assertEqual(trapezoidal_membership(10, (0, 0, 5, 10)), 0)


class FuzzyAnalysisTests(unittest.TestCase):
    def test_production_configuration_stays_disabled(self):
        self.assertEqual(FUZZY_CONFIG["membership"], {})
        self.assertEqual(FUZZY_CONFIG["rules"], [])
        self.assertIsNone(FUZZY_CONFIG["output_domain"])
        result = analyze(_reading(28, 7, 35))
        self.assertEqual(result["status"], "incomplete")
        self.assertIsNone(result["diagnosis"])

    def test_synthetic_scenarios_cover_three_categories(self):
        cases = (
            (_reading(28, 7, 35), "Baik"),
            (_reading(23, 6.1, 85), "Perlu Perhatian"),
            (_reading(15, 4, 150), "Buruk"),
            (_reading(28, 7, 150), "Buruk"),
        )
        for reading, expected_label in cases:
            with self.subTest(expected_label=expected_label, reading=reading):
                result = analyze(reading, TEST_CONFIG)
                self.assertEqual(result["status"], "complete")
                self.assertEqual(result["diagnosis"]["label"], expected_label)
                self.assertTrue(0 <= result["diagnosis"]["score"] <= 100)
                self.assertIn("Mamdani", result["message"])

    def test_missing_invalid_and_uncovered_inputs_are_incomplete(self):
        missing_ph = _reading(28, None, 35)
        missing_ph["ph_valid"] = False
        invalid_temperature = _reading(float("nan"), 7, 35)
        boolean_ph = _reading(28, True, 35)
        uncovered = _reading(1_000_000, 7, 35)

        for reading in (None, {}, missing_ph, invalid_temperature, boolean_ph):
            with self.subTest(reading=reading):
                result = analyze(reading, TEST_CONFIG)
                self.assertEqual(result["status"], "incomplete")
                self.assertIsNone(result["diagnosis"])

        outside = analyze(uncovered, TEST_CONFIG)
        self.assertEqual(outside["status"], "incomplete")
        self.assertIsNone(outside["diagnosis"])
        self.assertIn("tidak tercakup", outside["message"])


class AnalysisApiContractTests(unittest.TestCase):
    def test_sensor_endpoint_preserves_incomplete_analysis_shape(self):
        reading = _reading(28, 7, 35)
        reading.update({
            "turbidity_adc": 1800,
            "pump_status": "ON",
            "record_id": "test-only",
        })

        class Reader:
            def snapshot(self):
                return {
                    "reading": reading,
                    "last_received_at": datetime.now(timezone.utc).isoformat(),
                    "data_fresh": True,
                    "age_seconds": 0.1,
                    "connected": True,
                    "online": True,
                    "error": None,
                }

        class Firebase:
            available = False
            status = {
                "initialized": False,
                "connected": False,
                "pending_writes": 0,
            }

            def get_history(self, limit):
                return []

        app = create_app(serial_reader=Reader(), firebase_service=Firebase())
        app.testing = True
        response = app.test_client().get("/api/sensors")
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["analysis"]["status"], "incomplete")
        self.assertIsNone(body["analysis"]["diagnosis"])
        self.assertIsInstance(body["analysis"]["message"], str)
        self.assertEqual(body["temperature_c"], 28)
        self.assertEqual(body["ph"], 7)
        self.assertEqual(body["turbidity_kal"], 35)


if __name__ == "__main__":
    unittest.main()
