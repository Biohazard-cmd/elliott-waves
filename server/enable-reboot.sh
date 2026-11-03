#!/bin/sh
# Однократная настройка владельцем: sudo sh enable-reboot.sh
set -eu
test "$(id -u)" = 0 || { echo 'Запустите через sudo.'; exit 1; }
user=${SUDO_USER:-}
case "$user" in ''|root|*[!a-zA-Z0-9_-]*) echo 'Нужен запуск владельцем через sudo.'; exit 1;; esac
test -x /usr/bin/systemctl
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
printf '%s ALL=(root) NOPASSWD: /usr/bin/systemctl reboot\n' "$user" > "$tmp"
chmod 600 "$tmp"
/usr/sbin/visudo -cf "$tmp"
install -o root -g root -m 0440 "$tmp" /etc/sudoers.d/home-server-reboot
echo 'Разрешена только команда перезагрузки. Другие права не выдавались. Перезагрузка сейчас НЕ выполняется.'
