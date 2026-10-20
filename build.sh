#!/bin/sh
# Builds 187N Agent HQ (student edition): dashboard → sealed archive → universal app → signed → DMG.
#   sh build.sh            release build: dist/187N Agent HQ <version>.dmg
#   sh build.sh --test     test build (separate data folder and Keychain entry; allows local stand-ins), no DMG
# Signing for distribution (needs an Apple Developer ID; see README):
#   HQ_SIGN_IDENTITY="Developer ID Application: … (TEAMID)" HQ_NOTARY_PROFILE=<notarytool keychain profile> sh build.sh
set -e
cd "$(dirname "$0")"
MODE=release; [ "$1" = "--test" ] && MODE=test
# One version for both editions: the VERSION file (the Windows build reads the same file).
VERSION=$(tr -d ' \n' < VERSION)
echo "$VERSION" | /usr/bin/grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || { echo "VERSION must be x.y.z, found: $VERSION"; exit 1; }
# Build tools (esbuild, acorn, magic-string, Playwright): HQ_ESBUILD / HQ_TOOLS_MODULES / HQ_PLAYWRIGHT, else this
# project's node_modules, else the Hermes default; see build-tools/tools.cjs.

node frontend/export.mjs
node build-tools/pack.mjs build/web build/app.pak build/BuildInfo.swift "$VERSION"

NAME="187N Agent HQ"; [ $MODE = test ] && NAME="187N Agent HQ Test"
APP="build/$NAME.app"
rm -rf "$APP" build/bin && mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" build/bin build/AppIcon.iconset
FLAGS="-swift-version 5 -enable-bare-slash-regex -framework Cocoa -framework WebKit -framework Network -framework AVFoundation -framework UniformTypeIdentifiers"
SOURCES="app/main.swift app/Server/*.swift app/Engine/*.swift app/Security/*.swift build/BuildInfo.swift"
if [ $MODE = test ]; then
  swiftc $FLAGS -DDEBUG -Onone -target "$(uname -m)-apple-macos13" -o "$APP/Contents/MacOS/AgentHQ" $SOURCES
else
  swiftc $FLAGS -O -target arm64-apple-macos13 -o build/bin/AgentHQ-arm64 $SOURCES
  swiftc $FLAGS -O -target x86_64-apple-macos13 -o build/bin/AgentHQ-x86_64 $SOURCES
  lipo -create build/bin/AgentHQ-arm64 build/bin/AgentHQ-x86_64 -output "$APP/Contents/MacOS/AgentHQ"
  strip -x "$APP/Contents/MacOS/AgentHQ"
fi
cp app/Info.plist "$APP/Contents/Info.plist"
# The version comes from VERSION; the build number counts up with it (1.3.0 → 10300), so it only ever grows.
BUILDNUM=$(echo "$VERSION" | awk -F. '{print $1*10000 + $2*100 + $3}')
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" -c "Set :CFBundleVersion $BUILDNUM" "$APP/Contents/Info.plist"
if [ $MODE = test ]; then
  /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier ai.187n.agent-hq.student.test" -c "Set :CFBundleName $NAME" -c "Set :CFBundleDisplayName $NAME" "$APP/Contents/Info.plist"
fi
cp build/app.pak "$APP/Contents/Resources/app.pak"
cp app/Resources/THIRD-PARTY-NOTICES.txt "$APP/Contents/Resources/THIRD-PARTY-NOTICES.txt"
swiftc -O -target "$(uname -m)-apple-macos13" -framework Cocoa -o build/bin/make-icon build-tools/MakeIcon.swift
build/bin/make-icon frontend/pinned/assets/187n-infinity.png build/icon-1024.png
for s in 16 32 128 256 512; do
  sips -z $s $s build/icon-1024.png --out build/AppIcon.iconset/icon_${s}x${s}.png >/dev/null
  d=$((s*2)); sips -z $d $d build/icon-1024.png --out build/AppIcon.iconset/icon_${s}x${s}@2x.png >/dev/null
done
iconutil -c icns build/AppIcon.iconset -o "$APP/Contents/Resources/AppIcon.icns"

if [ -n "$HQ_SIGN_IDENTITY" ]; then
  codesign --force --options runtime --timestamp --entitlements app/AgentHQ.entitlements --sign "$HQ_SIGN_IDENTITY" "$APP"
else
  codesign --force --entitlements app/AgentHQ.entitlements --sign - "$APP"
fi
codesign --verify --strict "$APP"
echo "app: $APP"
[ $MODE = test ] && exit 0

# DMG: the app, a shortcut to Applications and "Read Me First", in a laid-out window (drag arrow on the background).
mkdir -p dist build/dmg-assets && rm -rf build/dmg && mkdir -p build/dmg/.background
node build-tools/dmg/render.cjs frontend/pinned/assets/187n-infinity-ui.png build/dmg-assets
tiffutil -cathidpicheck build/dmg-assets/background.png build/dmg-assets/background@2x.png -out build/dmg/.background/background.tiff >/dev/null 2>&1
cp -R "$APP" build/dmg/ && ln -s /Applications build/dmg/Applications && cp "build/dmg-assets/Read Me First.pdf" build/dmg/
DMG="dist/$NAME $VERSION.dmg"; rm -f "$DMG" build/rw.dmg
hdiutil create -volname "$NAME" -srcfolder build/dmg -ov -format UDRW -fs HFS+ build/rw.dmg >/dev/null
DEV=$(hdiutil attach -readwrite -noverify -noautoopen build/rw.dmg | /usr/bin/grep -E '^/dev/' | head -1 | awk '{print $1}')
# Window layout through Finder (needs permission to control Finder the first time; without it the DMG keeps the default layout).
osascript <<OSA || echo "note: Finder layout skipped (no automation permission); the DMG still works"
tell application "Finder"
  tell disk "$NAME"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {200, 120, 860, 560}
    set opts to the icon view options of container window
    set arrangement of opts to not arranged
    set icon size of opts to 96
    set text size of opts to 13
    set background picture of opts to file ".background:background.tiff"
    set position of item "$NAME.app" of container window to {170, 190}
    set position of item "Applications" of container window to {490, 190}
    set position of item "Read Me First.pdf" of container window to {330, 360}
    update without registering applications
    delay 1
    close
  end tell
end tell
OSA
sync; hdiutil detach "$DEV" >/dev/null || hdiutil detach -force "$DEV" >/dev/null
hdiutil convert build/rw.dmg -format UDZO -o "$DMG" >/dev/null && rm -f build/rw.dmg
[ -n "$HQ_SIGN_IDENTITY" ] && codesign --force --sign "$HQ_SIGN_IDENTITY" --timestamp "$DMG"
if [ -n "$HQ_NOTARY_PROFILE" ]; then
  xcrun notarytool submit "$DMG" --keychain-profile "$HQ_NOTARY_PROFILE" --wait
  xcrun stapler staple "$DMG"
fi
echo "dmg: $DMG ($(du -h "$DMG" | cut -f1))"
