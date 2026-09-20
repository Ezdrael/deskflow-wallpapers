#!/usr/bin/env bash

# Встановлення розширення Deskflow Wallpapers

EXTENSION_UUID="deskflow-wallpapers@maximilyan"
TARGET_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"

echo "Збирання GSettings схем..."
glib-compile-schemas schemas/

echo "Створення директорії $TARGET_DIR..."
mkdir -p "$TARGET_DIR"

echo "Копіювання файлів..."
cp metadata.json "$TARGET_DIR/"
cp extension.js "$TARGET_DIR/"
cp prefs.js "$TARGET_DIR/"
cp stylesheet.css "$TARGET_DIR/"
cp -r schemas "$TARGET_DIR/"

echo "Увімкнення розширення..."
gnome-extensions enable "$EXTENSION_UUID"

echo "Встановлення завершено!"
echo "Примітка: в GNOME 45+ під Wayland може знадобитися вийти та зайти в сеанс, щоб розширення активувалося (Log out -> Log in)."
