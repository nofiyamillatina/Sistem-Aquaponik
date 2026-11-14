
"""Mamdani fuzzy inference engine untuk monitoring kualitas air ikan nila."""

import math
from itertools import product

INPUTS = ("temperature_c", "ph", "turbidity_adc")

OUTPUT_LABELS = ("Baik", "Perlu Perhatian", "Buruk")

MEMBERSHIP = {
    "temperature_c": {
        "Dingin": {"type": "trapezoid", "points": (0, 0, 23, 27)},
        "Normal": {"type": "trapezoid", "points": (25, 27, 30, 32)},
        "Panas": {"type": "trapezoid", "points": (30, 34, 40, 40)},
    },
    "ph": {
        "Asam": {"type": "trapezoid", "points": (0, 0, 5, 6.5)},
        "Netral": {"type": "trapezoid", "points": (6, 6.5, 8, 8.5)},
        "Basa": {"type": "trapezoid", "points": (8, 8.5, 14, 14)},
    },
    "turbidity_adc": {
        "Sangat Keruh": {"type": "trapezoid", "points": (0, 0, 850, 941)},
        "Keruh": {"type": "trapezoid", "points": (850, 941, 1050, 1155)},
        "Jernih": {"type": "trapezoid", "points": (1050, 1155, 4090, 4090)},
    },
    "output": {
        "Baik": {"type": "trapezoid", "points": (0, 0, 20, 40)},
        "Perlu Perhatian": {"type": "triangle", "points": (25, 50, 75)},
        "Buruk": {"type": "trapezoid", "points": (60, 80, 100, 100)},
    },
}


def build_rules():
    temperature_sets = ("Dingin", "Normal", "Panas")
    ph_sets = ("Asam", "Netral", "Basa")
    turbidity_sets = ("Sangat Keruh", "Keruh", "Jernih")

    rules = []

    for temperature, ph, turbidity in product(
        temperature_sets, ph_sets, turbidity_sets
    ):
        non_ideal = sum((
            temperature != "Normal",
            ph != "Netral",
            turbidity != "Jernih",
        ))

        if non_ideal == 0:
            output = "Baik"
        elif non_ideal == 1:
            output = "Perlu Perhatian"
        else:
            output = "Buruk"

        rules.append({
            "if": {
                "temperature_c": temperature,
                "ph": ph,
                "turbidity_adc": turbidity,
            },
            "then": output,
        })

    return rules


FUZZY_CONFIG = {
    "membership": MEMBERSHIP,
    "rules": build_rules(),
    "output_domain": (0, 100, 1),
}


def _is_finite_number(value):
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def triangular_membership(value, points):
    if not _is_finite_number(value) or len(points) != 3:
        raise ValueError("Membership segitiga memerlukan tiga titik.")

    a, b, c = points

    if not all(_is_finite_number(p) for p in points) or not a <= b <= c:
        raise ValueError("Titik segitiga tidak valid.")

    if value == b:
        return 1.0
    if value <= a or value >= c:
        return 0.0
    if value < b:
        return 1.0 if a == b else (value - a) / (b - a)

    return 1.0 if b == c else (c - value) / (c - b)


def trapezoidal_membership(value, points):
    if not _is_finite_number(value) or len(points) != 4:
        raise ValueError("Membership trapesium memerlukan empat titik.")

    a, b, c, d = points

    if not all(_is_finite_number(p) for p in points) or not a <= b <= c <= d:
        raise ValueError("Titik trapesium tidak valid.")

    if b <= value <= c:
        return 1.0
    if value <= a or value >= d:
        return 0.0
    if value < b:
        return 1.0 if a == b else (value - a) / (b - a)

    return 1.0 if c == d else (d - value) / (d - c)


def _membership(value, definition):
    if not isinstance(definition, dict):
        raise ValueError("Definisi membership tidak valid.")

    kind = definition.get("type")
    points = definition.get("points")

    if not isinstance(points, (list, tuple)):
        raise ValueError("Titik membership harus berupa daftar.")

    if kind == "triangle":
        return triangular_membership(value, points)

    if kind == "trapezoid":
        return trapezoidal_membership(value, points)

    raise ValueError(f"Tipe membership tidak didukung: {kind}")


def _is_configured(settings):
    if not isinstance(settings, dict):
        return False

    membership = settings.get("membership")
    rules = settings.get("rules")
    output_domain = settings.get("output_domain")

    return (
        isinstance(membership, dict)
        and all(
            isinstance(membership.get(field), dict)
            and bool(membership[field])
            for field in INPUTS
        )
        and isinstance(membership.get("output"), dict)
        and all(label in membership["output"] for label in OUTPUT_LABELS)
        and isinstance(rules, list)
        and bool(rules)
        and isinstance(output_domain, (list, tuple))
        and len(output_domain) == 3
    )


def _sample_domain(output_domain):
    low, high, step = output_domain

    if not all(_is_finite_number(v) for v in (low, high, step)):
        raise ValueError("Domain output harus numerik.")

    if step <= 0 or high <= low:
        raise ValueError("Domain output tidak valid.")

    count = int((high - low) / step)
    samples = [low + index * step for index in range(count + 1)]

    if samples[-1] < high:
        samples.append(high)

    return samples


def infer(inputs, config=None):
    """Mamdani min-max dengan defuzzifikasi centroid."""

    settings = FUZZY_CONFIG if config is None else config

    if not _is_configured(settings):
        return None

    membership = settings["membership"]
    output_sets = membership["output"]
    samples = _sample_domain(settings["output_domain"])

    aggregated = [0.0] * len(samples)

    for rule in settings["rules"]:
        conditions = rule["if"]

        strength = min(
            _membership(inputs[field], membership[field][label])
            for field, label in conditions.items()
        )

        output_label = rule["then"]

        for index, output_value in enumerate(samples):
            degree = _membership(output_value, output_sets[output_label])
            aggregated[index] = max(
                aggregated[index],
                min(strength, degree),
            )

    area = sum(aggregated)

    if area == 0:
        return None

    score = sum(
        value * degree
        for value, degree in zip(samples, aggregated)
    ) / area

    output_degrees = {
        label: _membership(score, output_sets[label])
        for label in OUTPUT_LABELS
    }

    if max(output_degrees.values()) == 0:
        return None

    priority = {"Baik": 0, "Perlu Perhatian": 1, "Buruk": 2}

    label = max(
        OUTPUT_LABELS,
        key=lambda item: (output_degrees[item], priority[item]),
    )

    return {"label": label, "score": score}



def generate_recommendation(reading, diagnosis):
    """Membuat rekomendasi berdasarkan diagnosis dan kondisi sensor."""

    label = diagnosis["label"]
    issues = []

    temperature = reading["temperature_c"]
    ph = reading["ph"]
    turbidity = reading["turbidity_adc"]

    # Pemeriksaan kondisi suhu.
    temperature_degrees = {
        name: _membership(temperature, definition)
        for name, definition in MEMBERSHIP["temperature_c"].items()
    }

    temperature_condition = max(
        temperature_degrees,
        key=temperature_degrees.get,
    )

    if temperature_condition == "Dingin":
        issues.append({
            "parameter": "Suhu",
            "condition": "Dingin",
            "recommendation": (
                "Suhu air berada di bawah rentang normal. "
                "Periksa kestabilan suhu air."
            ),
        })
    elif temperature_condition == "Panas":
        issues.append({
            "parameter": "Suhu",
            "condition": "Panas",
            "recommendation": (
                "Suhu air berada di atas rentang normal. "
                "Periksa kondisi lingkungan dan upayakan pengendalian suhu."
            ),
        })

    # Pemeriksaan kondisi pH berdasarkan membership tertinggi.
    ph_degrees = {
        name: _membership(ph, definition)
        for name, definition in MEMBERSHIP["ph"].items()
    }

    ph_condition = max(
        ph_degrees,
        key=ph_degrees.get,
    )

    if ph_condition == "Asam":
        issues.append({
            "parameter": "pH",
            "condition": "Asam",
            "recommendation": (
                "Air cenderung asam. Periksa pH dan lakukan koreksi "
                "secara bertahap sesuai kebutuhan ikan dan tanaman."
            ),
        })
    elif ph_condition == "Basa":
        issues.append({
            "parameter": "pH",
            "condition": "Basa",
            "recommendation": (
                "Air cenderung basa. Periksa pH dan lakukan koreksi "
                "secara bertahap sesuai kebutuhan ikan dan tanaman."
            ),
        })

    # Pemeriksaan kondisi turbidity berdasarkan membership tertinggi.
    turbidity_degrees = {
        name: _membership(turbidity, definition)
        for name, definition in MEMBERSHIP["turbidity_adc"].items()
    }

    turbidity_condition = max(
        turbidity_degrees,
        key=turbidity_degrees.get,
    )

    if turbidity_condition == "Sangat Keruh":
        issues.append({
            "parameter": "Turbidity",
            "condition": "Sangat Keruh",
            "recommendation": (
                "Air terindikasi sangat keruh. Periksa sumber kekeruhan "
                "dan kondisi filter."
            ),
        })
    elif turbidity_condition == "Keruh":
        issues.append({
            "parameter": "Turbidity",
            "condition": "Keruh",
            "recommendation": (
                "Air terindikasi keruh. Periksa kondisi air dan filter."
            ),
        })

    if label == "Baik":
        summary = (
            "Kualitas air berdasarkan parameter yang dipantau berada "
            "dalam kondisi baik. Pertahankan sirkulasi air."
        )
    elif label == "Perlu Perhatian":
        summary = (
            "Kualitas air memerlukan perhatian. Periksa parameter "
            "yang belum berada dalam kondisi optimal."
        )
    else:
        summary = (
            "Kualitas air terindikasi buruk. Segera periksa kondisi air "
            "dan lakukan penanganan yang sesuai."
        )

    if not issues:
        summary += (
            " Tidak ditemukan parameter yang melewati batas pemeriksaan "
            "rekomendasi."
        )

    return {
        "summary": summary,
        "issues": issues,
        "pump_recommendation": (
            "Pompa tetap ON untuk menjaga sirkulasi air."
        ),
    }

def analyze(reading, config=None):
    """Validasi data sensor dan jalankan diagnosis fuzzy."""

    incomplete = {
        "status": "incomplete",
        "diagnosis": None,
        "recommendation": None,
        "message": (
            "Diagnosis tiga parameter belum lengkap atau tidak valid; "
            "pastikan suhu, pH, dan turbidity valid."
        ),
    }

    if not isinstance(reading, dict):
        return incomplete

    temperature = reading.get("temperature_c")
    turbidity_adc = reading.get("turbidity_adc")

    if (
        temperature == -127
        or (
            _is_finite_number(temperature)
            and not math.isfinite(float(temperature))
        )
    ):
        return {
            **incomplete,
            "message": "Pembacaan suhu tidak valid.",
        }

    if _is_finite_number(turbidity_adc) and turbidity_adc >= 4090:
        return {
            **incomplete,
            "message": "ADC turbidity saturasi; data tidak valid.",
        }

    for field in INPUTS:
        valid_field = f"{field.split('_')[0]}_valid"

        if (
            reading.get(valid_field) is not True
            or not _is_finite_number(reading.get(field))
        ):
            return incomplete

    settings = FUZZY_CONFIG if config is None else config

    if not _is_configured(settings):
        return {
            **incomplete,
            "message": "Konfigurasi fuzzy belum lengkap.",
        }

    try:
        result = infer(
            {field: reading[field] for field in INPUTS},
            settings,
        )
    except (ValueError, KeyError, TypeError):
        return {
            **incomplete,
            "message": "Terjadi kesalahan pada konfigurasi fuzzy.",
        }

    if result is None:
        return {
            **incomplete,
            "message": "Input tidak tercakup membership function.",
        }

    recommendation = generate_recommendation(reading, result)

    return {
        "status": "complete",
        "diagnosis": result,
        "recommendation": recommendation,
        "message": "Inferensi Mamdani selesai.",
    }
