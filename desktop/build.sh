#!/usr/bin/env bash
# Сборка программы для Windows: Electron (готовый, с сайта Electron) + main.js/preload.js + страница из android/assets.
# Нужны: bash, curl, unzip, zip, node. Запуск: cd desktop && bash build.sh
# Готово: build/ElliottWaves/ (папка программы), build/ElliottWaves-<версия>-win.zip (целиком),
#         build/ElliottWaves-<версия>-app.zip (только resources/app — для обновления уже установленной программы).
set -euo pipefail
cd "$(dirname "$0")"
EV="${ELECTRON_VER:-44.9.3}"
VER=$(grep -o "APP_VER = '[^']*'" ../android/assets/app.js | head -1 | cut -d"'" -f2)
ZIP="cache/electron-v$EV-win32-x64.zip"
mkdir -p cache
if [ ! -f "$ZIP" ]; then
  echo "Скачиваю Electron $EV для Windows…"
  curl -fSL -o "$ZIP.part" "https://github.com/electron/electron/releases/download/v$EV/electron-v$EV-win32-x64.zip" \
    || curl -fSL -o "$ZIP.part" "https://npmmirror.com/mirrors/electron/$EV/electron-v$EV-win32-x64.zip"
  mv "$ZIP.part" "$ZIP"
fi
OUT=build/ElliottWaves
rm -rf build && mkdir -p "$OUT"
unzip -q "$ZIP" -d "$OUT"
mv "$OUT/electron.exe" "$OUT/ElliottWaves.exe"
rm -f "$OUT/resources/default_app.asar"
# языки Chromium: оставляем русский и английский (меньше на ~40 МБ)
find "$OUT/locales" -name '*.pak' ! -name 'ru.pak' ! -name 'en-US.pak' -delete
APP="$OUT/resources/app"
mkdir -p "$APP/assets"
cp package.json main.js preload.js "$APP/"
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VER.0\"/" "$APP/package.json"
cp ../android/res/mipmap-xxhdpi/ic_launcher.png "$APP/icon.png"
cp ../android/assets/*.html ../android/assets/*.js "$APP/assets/"
rm -f "$APP/assets/worker.html"   # фоновая страница телефона — на компьютере не нужна
# значок и описание у ElliottWaves.exe (необязательно: нужен пакет resedit в NODE_PATH)
if node -e "require('resedit')" 2>/dev/null; then node exeinfo.js "$OUT/ElliottWaves.exe" "$APP/icon.png" "$VER" && echo "значок у .exe поставлен"; else echo "resedit нет — значок у .exe стандартный"; fi
(cd build && zip -qr9 "ElliottWaves-$VER-win.zip" ElliottWaves && cd ElliottWaves/resources && zip -qr9 "../../ElliottWaves-$VER-app.zip" app)
ls -la build/*.zip
