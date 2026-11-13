# SIMPONI – Arduino ESP32 + USB Serial + Flask + Firebase

Dokumen ini menjelaskan cara menjalankan dan memeriksa sistem monitoring kualitas air aquaponik dengan arsitektur final:

Sensor → ESP32 → USB Serial → Python Flask Backend → Firebase Realtime Database → Dashboard SIMPONI

## 1. Persiapan ESP32 dan sensor

1. Pastikan ESP32 sudah terhubung ke sensor DS18B20, turbidity sensor TS-300B, dan probe pH 4502C.
2. Gunakan pin yang dipertahankan:
   - pH: GPIO 35
   - Turbidity: GPIO 34
   - DS18B20: GPIO 14
   - Relay: GPIO 32
3. Relay tetap diatur sebagai Active LOW dan perintah pompa Always ON.
4. Firmware final mengadopsi kalibrasi pH tiga titik dan batas turbidity yang sudah divalidasi; pengolahan data backend tetap menolak nilai yang tidak valid atau saturasi.
5. Firmware ESP32 dapat dikompilasi melalui Arduino IDE atau PlatformIO, dengan source-of-truth utama tetap pada `firmware/SIMPONI_ESP32/SIMPONI_ESP32.ino`.

## 2. Mengunggah firmware melalui Arduino IDE

1. Buka Arduino IDE.
2. Buka file `firmware/SIMPONI_ESP32/SIMPONI_ESP32.ino`.
3. Dari Library Manager, instal library `OneWire` dan `DallasTemperature` jika belum tersedia.
4. Pilih board: `ESP32 Dev Module` atau board ESP32 yang sesuai.
5. Pilih port USB yang terdeteksi.
6. Klik `Upload`.
7. Setelah upload selesai, buka Serial Monitor untuk memeriksa baris debug dan JSON sensor.

Interval pembacaan default ditetapkan pada `firmware/SIMPONI_ESP32/config.h` (`SENSOR_INTERVAL_MS = 180000`). Ubah nilai konfigurasi tersebut jika interval perlu disesuaikan.

Contoh debug dari firmware:

```text
MONITORING AQUAPONIK
Mode: Monitoring dengan relay ON
Relay: ON
```

## 3. Menghubungkan ESP32 ke laptop melalui USB

1. Hubungkan ESP32 ke laptop melalui kabel USB data.
2. Pastikan driver CH340/CP210x sudah terinstal jika dibutuhkan.
3. Fungsi komunikasi utama pada sistem ini adalah UART serial, bukan Wi-Fi HTTP.
4. Tidak ada WebServer ESP32 yang dipasang pada firmware final.
5. Tutup Serial Monitor/Serial Plotter Arduino IDE sebelum menjalankan backend karena satu port COM hanya dapat dibuka oleh satu proses pada satu waktu.

## 4. Menentukan port COM ESP32

Pada Windows, cek port serial di Device Manager atau menggunakan PowerShell:

```powershell
Get-CimInstance Win32_SerialPort | Select-Object Name,DeviceID
```

Port yang biasanya muncul seperti:

```text
COM3
COM4
COM5
```

Setelah port ditentukan, salin file konfigurasi backend:

```powershell
Copy-Item .\backend\.env.example .\backend\.env
```

Edit file `backend/.env` dan sesuaikan nilai COM port:

```env
SERIAL_PORT=COM3
SERIAL_BAUD_RATE=115200
SENSOR_INTERVAL_MS=180000
SENSOR_STALE_SECONDS=360
FLASK_HOST=127.0.0.1
FLASK_PORT=5000
```

`SENSOR_INTERVAL_MS` di `.env` mendokumentasikan interval pembacaan yang diharapkan backend; interval firmware aktual diatur di `firmware/SIMPONI_ESP32/config.h`. `SENSOR_STALE_SECONDS` default dua kali interval sensor sehingga data yang menunggu jadwal pembacaan berikutnya tidak langsung ditandai kedaluwarsa.

## 5. Menginstal Python dan dependensi

1. Instal Python 3.10+.
2. Pastikan `pip` sudah aktif.
3. Install dependensi backend:

```powershell
python -m pip install --upgrade pip
python -m pip install -r .\backend\requirements.txt
```

## 6. Mengonfigurasi Firebase

1. Buat project Firebase di Firebase Console.
2. Aktifkan Realtime Database.
3. Buat service account Firebase dan unduh file JSON.
4. Simpan file JSON di lokasi aman di luar repository project.
5. Isi konfigurasi di `backend/.env`:

```env
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\firebase-service-account.json
```

6. Pastikan file credential tidak masuk ke Git. `backend/.env` dan file JSON sudah dibatasi oleh `.gitignore`.

## 7. Menjalankan Python Flask Backend

Dari root project:

```powershell
python .\backend\app.py
```

Atau masuk ke folder backend terlebih dahulu:

```powershell
cd .\backend
python app.py
```

Backend akan:

- membuka USB Serial sesuai `SERIAL_PORT`
- membaca satu JSON per baris dari ESP32
- memvalidasi payload sensor
- menangani port yang tidak tersedia/terputus
- menulis ke Firebase jika kredensial sudah siap
- menyediakan endpoint REST API
- mengantrekan pembacaan jika operasi Firebase gagal dan mencoba kembali; antrean dibatasi agar memori backend tetap terkendali

Antrean retry Firebase berada di memori proses. Jika `pending_writes` belum nol saat backend dihentikan, record yang belum tersimpan belum persisten dan perlu pembacaan ulang setelah backend/Firebase pulih.

Endpoint utama:

- `http://127.0.0.1:5000/api/sensors`
- `http://127.0.0.1:5000/api/history`
- `http://127.0.0.1:5000/api/status`

## 8. Menjalankan dashboard menggunakan Live Server

1. Buka project di VS Code.
2. Jalankan Live Server pada file `index.html`.
3. Pastikan dashboard mengakses backend melalui URL:

```text
http://127.0.0.1:5000/api/sensors
```

4. Interval polling dashboard adalah 30000 ms dan dapat diubah pada `js/config.js` (`POLL_INTERVAL_MS`).
5. Dashboard tidak mengirim permintaan langsung ke ESP32.
6. Polling hanya membaca API; satu baris serial baru yang valid menjadi satu record, tanpa membuat record baru saat dashboard refresh.

## 9. Memeriksa apakah data sensor benar-benar masuk

1. Buka Serial Monitor di Arduino IDE.
2. Pastikan firmware mengirim satu objek JSON per baris seperti berikut (angka hanya contoh format, bukan pembacaan aktual):

```json
{"temperature_c":27.8,"temperature_valid":true,"turbidity_adc":1800,"turbidity_kal":50.45,"turbidity_valid":true,"ph":null,"ph_valid":false,"pump_status":"ON"}
```

3. Cek endpoint backend:

```powershell
curl http://127.0.0.1:5000/api/sensors
```

4. Jika port serial tidak tersedia, backend akan menunjukkan status koneksi dan kesegaran secara terpisah. Data terakhir tetap berstempel waktu, ditandai kedaluwarsa bila melewati ambang, dan tidak dianggap sebagai pembacaan terbaru.

## 10. Memeriksa penyimpanan data di Firebase

1. Buka Firebase Console > Realtime Database.
2. Cek tree berikut:
   - `sensor_readings`
   - `latest_readings`
   - `fuzzy_results`
   - `system_status`
3. Pastikan data historis tidak tertimpa oleh pembacaan terbaru.
4. Saat sensor baru masuk, `latest_readings` ditimpa pada satu lokasi tetap, sementara `sensor_readings/{record_id}` menyimpan satu record unik per pembacaan.
5. Jika pH belum terintegrasi, value pH tetap null dan valid false; diagnosis tidak dianggap lengkap.
6. Status Firebase menunjukkan apakah SDK berhasil diinisialisasi dan apakah operasi database terakhir berhasil; inisialisasi SDK sendiri bukan bukti koneksi database.

## Struktur folder akhir

```text
Sistem-Aquaponik/
├─ backend/
│  ├─ app.py
│  ├─ serial_reader.py
│  ├─ firebase_service.py
│  ├─ fuzzy_engine.py
│  ├─ config.py
│  ├─ requirements.txt
│  ├─ .env.example
│  └─ .env  (tidak di-commit)
├─ firmware/
│  └─ SIMPONI_ESP32/
│     ├─ SIMPONI_ESP32.ino
│     └─ config.h
├─ js/
│  ├─ config.js
│  ├─ dashboard-ui.js
│  ├─ dashboard.js
│  ├─ sensor-api.js
│  └─ sensor-status.js
├─ .gitignore
├─ index.html
├─ style.css
├─ README.md
└─ ...
```

## Poin penting yang harus selalu diingat

- Firmware ESP32 tidak lagi memakai Wi‑Fi WebServer.
- Komunikasi utama adalah via USB Serial.
- Backend Flask memvalidasi dan memproses data.
- Firebase Realtime Database digunakan sebagai sumber data utama untuk historis dan status sistem.
- Dashboard SIMPONI mengambil data dari backend, bukan langsung dari ESP32.
- Interval pembacaan default sensor adalah 180000 ms dan refresh dashboard 30000 ms.
- Riwayat dan grafik hanya berubah saat pembacaan baru diterima; dashboard tidak menulis data ke Firebase.
- `latest_readings` adalah satu record terbaru, bukan node beranak per pembacaan.
- Data pH belum dianggap aktif sampai sensor PH-4502C benar-benar diintegrasikan.
- Diagnosis fuzzy disediakan sebagai struktur modular yang siap diisi berdasarkan studi literatur dan kebutuhan ikan nila serta selada.
