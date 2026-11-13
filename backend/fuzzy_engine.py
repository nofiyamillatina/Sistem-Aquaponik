"""Mamdani inference engine; production parameters remain disabled until approved."""

import math

INPUTS = ("temperature_c", "ph", "turbidity_kal")
OUTPUT_LABELS = ("Baik", "Perlu Perhatian", "Buruk")

# Do not populate with unapproved biological thresholds or turbidity boundaries.
FUZZY_CONFIG = {
    "membership": {},
    "rules": [],
    "output_domain": None,
}


def _is_finite_number(value):
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def triangular_membership(value, points):
    if not _is_finite_number(value) or len(points) != 3:
        raise ValueError("Membership segitiga memerlukan nilai numerik dan tiga titik.")
    a, b, c = points
    if not all(_is_finite_number(point) for point in points) or not a <= b <= c:
        raise ValueError("Titik fungsi segitiga harus numerik dan berurutan.")
    if value == b:
        return 1.0
    if value <= a or value >= c:
        return 0.0
    if value < b:
        return 1.0 if a == b else (value - a) / (b - a)
    return 1.0 if b == c else (c - value) / (c - b)


def trapezoidal_membership(value, points):
    if not _is_finite_number(value) or len(points) != 4:
        raise ValueError("Membership trapesium memerlukan nilai numerik dan empat titik.")
    a, b, c, d = points
    if not all(_is_finite_number(point) for point in points) or not a <= b <= c <= d:
        raise ValueError("Titik fungsi trapesium harus numerik dan berurutan.")
    if b <= value <= c:
        return 1.0
    if value <= a or value >= d:
        return 0.0
    if value < b:
        return 1.0 if a == b else (value - a) / (b - a)
    return 1.0 if c == d else (d - value) / (d - c)


def _membership(value, definition):
    if not isinstance(definition, dict):
        raise ValueError("Definisi membership harus berupa objek.")
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
        and all(isinstance(membership.get(field), dict) and membership[field] for field in INPUTS)
        and isinstance(membership.get("output"), dict)
        and all(label in membership["output"] for label in OUTPUT_LABELS)
        and isinstance(rules, list)
        and bool(rules)
        and isinstance(output_domain, (list, tuple))
        and len(output_domain) == 3
    )


def _sample_domain(output_domain):
    low, high, step = output_domain
    if not all(_is_finite_number(value) for value in (low, high, step)):
        raise ValueError("Domain output fuzzy harus berisi angka finite.")
    if step <= 0 or high <= low:
        raise ValueError("Domain output fuzzy tidak valid.")
    steps = int((high - low) // step)
    samples = [low + index * step for index in range(steps + 1)]
    if samples[-1] < high:
        samples.append(high)
    return samples


def infer(inputs, config=None):
    """Run Mamdani min/max inference and sampled-centroid defuzzification."""
    settings = FUZZY_CONFIG if config is None else config
    if not _is_configured(settings):
        return None

    membership = settings["membership"]
    output_sets = membership["output"]
    samples = _sample_domain(settings["output_domain"])
    aggregated = [0.0] * len(samples)
    output_priority = {label: index for index, label in enumerate(OUTPUT_LABELS)}

    for rule in settings["rules"]:
        if not isinstance(rule, dict) or not isinstance(rule.get("if"), dict) or not rule["if"]:
            raise ValueError("Setiap rule harus memiliki antecedent IF.")
        conditions = rule["if"]
        if any(field not in INPUTS for field in conditions):
            raise ValueError("Rule menggunakan input yang tidak dikenal.")
        try:
            strength = min(
                _membership(inputs[field], membership[field][label])
                for field, label in conditions.items()
            )
        except KeyError as error:
            raise ValueError(f"Rule merujuk membership yang tidak tersedia: {error}") from error

        output_label = rule.get("then")
        if output_label not in OUTPUT_LABELS:
            raise ValueError("Konsekuen rule harus Baik, Perlu Perhatian, atau Buruk.")
        for index, output_value in enumerate(samples):
            output_degree = _membership(output_value, output_sets[output_label])
            aggregated[index] = max(
                aggregated[index],
                min(strength, output_degree),
            )

    area = sum(aggregated)
    if area == 0:
        return None
    score = sum(value * degree for value, degree in zip(samples, aggregated)) / area
    output_degrees = {
        label: _membership(score, output_sets[label])
        for label in OUTPUT_LABELS
    }
    if max(output_degrees.values()) == 0:
        return None
    label = max(
        OUTPUT_LABELS,
        key=lambda item: (output_degrees[item], output_priority[item]),
    )
    return {"label": label, "score": score}


def analyze(reading, config=None):
    """Return the stable API analysis shape, or incomplete when inputs/config are unavailable."""
    if not isinstance(reading, dict):
        return {
            "status": "incomplete",
            "diagnosis": None,
            "message": "Diagnosis tiga parameter belum lengkap atau tidak valid; pastikan suhu, pH, dan turbidity valid.",
        }

    temperature = reading.get("temperature_c")
    turbidity_adc = reading.get("turbidity_adc")
    if temperature == -127 or (isinstance(temperature, (int, float)) and not isinstance(temperature, bool) and not math.isfinite(float(temperature))):
        return {
            "status": "incomplete",
            "diagnosis": None,
            "message": "Pembacaan suhu tidak valid (sensor terputus atau menghasilkan -127°C).",
        }
    if isinstance(turbidity_adc, (int, float)) and not isinstance(turbidity_adc, bool) and turbidity_adc >= 4090:
        return {
            "status": "incomplete",
            "diagnosis": None,
            "message": "ADC turbidity saturasi; data tidak valid untuk inferensi fuzzy.",
        }
    if not all(
        reading.get(f"{field.split('_')[0]}_valid") is True
        and _is_finite_number(reading.get(field))
        for field in INPUTS
    ):
        return {
            "status": "incomplete",
            "diagnosis": None,
            "message": "Diagnosis tiga parameter belum lengkap atau tidak valid; pastikan suhu, pH, dan turbidity valid.",
        }

    settings = FUZZY_CONFIG if config is None else config
    if not _is_configured(settings):
        return {
            "status": "incomplete",
            "diagnosis": None,
            "message": "Membership function, rule base, dan domain output belum ditetapkan dari rujukan dan kalibrasi yang disetujui.",
        }

    result = infer({field: reading[field] for field in INPUTS}, settings)
    if result is None:
        return {
            "status": "incomplete",
            "diagnosis": None,
            "message": "Nilai input tidak tercakup oleh membership function; diagnosis tidak dapat ditentukan.",
        }
    return {
        "status": "complete",
        "diagnosis": result,
        "message": "Inferensi Mamdani selesai.",
    }
