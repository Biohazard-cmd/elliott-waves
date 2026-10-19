#!/bin/bash
# Сборка APK без Android Studio: aapt2 (ресурсы), javac + dx (код), uber-apk-signer (выравнивание и подпись)
set -e
# инструменты: папка tools рядом с проектом (из архива elliott-tools.zip) или /tmp/tools; можно задать TOOLS=...
HERE="$(cd "$(dirname "$0")" && pwd)"
T=${TOOLS:-$( [ -d "$HERE/../tools" ] && echo "$HERE/../tools" || echo /tmp/tools )}
VER_CODE=${VER_CODE:-1}
cd "$(dirname "$0")"
# версия по умолчанию — из APP_VER в app.js, чтобы в приложении и в файле была одна и та же
VER_NAME=${VER_NAME:-$(grep -o "APP_VER = '[^']*'" assets/app.js | cut -d"'" -f2)}
rm -rf build && mkdir -p build/gen build/classes
$T/aapt2_64 compile --dir res -o build/res.zip
$T/aapt2_64 link -o build/base.apk -I $T/android.jar --manifest AndroidManifest.xml -A assets build/res.zip \
  --java build/gen --min-sdk-version 24 --target-sdk-version 29 --version-code $VER_CODE --version-name $VER_NAME --auto-add-overlay
javac -nowarn --release 8 -cp $T/android.jar -d build/classes $(find src build/gen -name '*.java') 2>&1 | grep -v "JAVA_TOOL_OPTIONS\|bootstrap\|source value 8\|target value 8\|To suppress\|^[0-9] warning" || true
(cd build/classes && jar cf ../classes.jar .)
java -cp $T/dex-tools-v2.4/lib/dx-30.0.2.jar com.android.dx.command.Main --dex --min-sdk-version=24 --output=build/classes.dex build/classes.jar
cp build/base.apk build/app-unsigned.apk
(cd build && zip -q -j app-unsigned.apk classes.dex)
java -jar $T/uber-apk-signer-1.3.0.jar -a build/app-unsigned.apk -o build/out --allowResign > build/sign.log 2>&1 || (cat build/sign.log; exit 1)
ls build/out/*.apk
