# Teyvat Map — Android App

Custom Teyvat Interactive Map untuk Genshin Impact, sinkron dengan akun HoYoverse, hanya menampilkan item/quest yang **belum** dikumpulkan.

## Fitur
- 🗺️ Peta Teyvat penuh (tiles dari Hoyoverse CDN)
- 🔍 Filter kategori (Chests, Oculi, Local Specialties, dll)
- 🎒 Sinkron akun via cookie HoYoLAB → hanya tampilkan **uncollected**
- 🌍 Border wilayah (Mondstadt, Liyue, Inazuma, dll)
- 📱 Native Android WebView (no CORS issue, akses API langsung)

## Build APK

### Opsi 1: GitHub Actions (Recommended)
1. Fork / push repo ini ke GitHub
2. Buka tab **Actions** → **Build APK** → **Run workflow**
3. Download artifact `app-debug.apk` dari run yang selesai

### Opsi 2: Local (PC/Linux/macOS)
```bash
# Prereqs: JDK 17, Android SDK (cmdline-tools + platform-34 + build-tools)
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

### Opsi 3: Android Studio
1. Open project folder
2. Build → Build Bundle(s) / APK(s) → Build APK(s)

## Cara Pakai
1. Buka aplikasi
2. Panel kiri: **Account Sync** → paste cookie HoYoLAB (dari browser, domain `hoyolab.com`)
3. Klik **Save Cookie**
4. Panel akan tampil **Synced: X marks** → hanya uncollected yang muncul
5. Centang/uncentang kategori di panel untuk filter

## Catatan Teknis
- **No backend** — WebView disable CORS, panggil API Hoyoverse langsung
- Cookie disimpan di `SharedPreferences` (aman, sandbox per-app)
- Tile URL: `act-webstatic.hoyoverse.com/map_manage/map/2/{version}/{x}_{y}_{P|N}{z}.png`
- Koordinat v2: `origin=[24206,8918]`, `total_size=[36864,18432]`
- Rate limit: 120ms antar write (mark point)

## Structure
```
├── app/
│   ├── src/main/
│   │   ├── java/com/teyvatmap/MainActivity.java
│   │   ├── assets/index.html + app.js
│   │   ├── res/layout/activity_main.xml
│   │   └── res/values/{strings.xml,themes.xml}
│   └── build.gradle
├── build.gradle (root)
├── settings.gradle
├── gradlew / gradlew.bat
└── .github/workflows/build.yml
```

## Lisensi
Personal use only. Data peta milik HoYoverse/miHoYo.
