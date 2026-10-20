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
# aapt2: на Linux — aapt2_64, в Git Bash на Windows — aapt2.exe (Google Maven, com.android.tools.build:aapt2:…:windows)
AAPT2=$T/aapt2_64
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) AAPT2=$T/aapt2.exe;; esac
$AAPT2 compile --dir res -o build/res.zip
$AAPT2 link -o build/base.apk -I $T/android.jar --manifest AndroidManifest.xml -A assets build/res.zip \
  --java build/gen --min-sdk-version 24 --target-sdk-version 29 --version-code $VER_CODE --version-name $VER_NAME --auto-add-overlay
javac -nowarn --release 8 -cp $T/android.jar -d build/classes $(find src build/gen -name '*.java') 2>&1 | grep -v "JAVA_TOOL_OPTIONS\|bootstrap\|source value 8\|target value 8\|To suppress\|^[0-9] warning" || true
(cd build/classes && jar cf ../classes.jar .)
java -cp $T/dex-tools-v2.4/lib/dx-30.0.2.jar com.android.dx.command.Main --dex --min-sdk-version=24 --output=build/classes.dex build/classes.jar
cp build/base.apk build/app-unsigned.apk
# добавить classes.dex в корень архива: zip, а на Windows без zip — встроенным .NET ZipArchive
if command -v zip >/dev/null; then (cd build && zip -q -j app-unsigned.apk classes.dex)
else powershell -NoProfile -Command "Add-Type -A System.IO.Compression.FileSystem; \$z=[IO.Compression.ZipFile]::Open('$(cygpath -w "$PWD/build/app-unsigned.apk")','Update'); [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile(\$z,'$(cygpath -w "$PWD/build/classes.dex")','classes.dex'); \$z.Dispose()"; fi
java -jar $T/uber-apk-signer-1.3.0.jar -a build/app-unsigned.apk -o build/out --allowResign > build/sign.log 2>&1 || (cat build/sign.log; exit 1)
ls build/out/*.apk
