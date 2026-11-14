
from itertools import product
from fuzzy_engine import FUZZY_CONFIG, infer

temperature_tests = {
    "Dingin": 20,
    "Normal": 28,
    "Panas": 35,
}

ph_tests = {
    "Asam": 4,
    "Netral": 7,
    "Basa": 9,
}

turbidity_tests = {
    "Sangat Keruh": 700,
    "Keruh": 1000,
    "Jernih": 1300,
}

print("=" * 75)
print("PENGUJIAN 27 RULE FUZZY MAMDANI SIMPONI")
print("=" * 75)

print("Jumlah aturan:", len(FUZZY_CONFIG["rules"]))

passed = 0
failed = 0

for temperature, ph, turbidity in product(
    temperature_tests,
    ph_tests,
    turbidity_tests,
):
    inputs = {
        "temperature_c": temperature_tests[temperature],
        "ph": ph_tests[ph],
        "turbidity_adc": turbidity_tests[turbidity],
    }

    non_ideal = sum((
        temperature != "Normal",
        ph != "Netral",
        turbidity != "Jernih",
    ))

    expected = (
        "Baik" if non_ideal == 0
        else "Perlu Perhatian" if non_ideal == 1
        else "Buruk"
    )

    result = infer(inputs)
    actual = result["label"] if result else None

    if actual == expected:
        status = "SESUAI"
        passed += 1
    else:
        status = "TIDAK SESUAI"
        failed += 1

    print(
        f"{temperature:12} | {ph:8} | {turbidity:12} | "
        f"{str(actual):17} | {status}"
    )

print("\n" + "=" * 75)
print("RINGKASAN PENGUJIAN")
print("Total pengujian :", passed + failed)
print("Berhasil        :", passed)
print("Gagal           :", failed)
print("=" * 75)
