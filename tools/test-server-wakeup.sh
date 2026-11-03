#!/bin/sh
# Одноразовый тест: 60 секунд сна с аппаратным пробуждением, без изменения расписания.
set -eu
if [ "$(id -u)" != 0 ]; then echo 'Нужен запуск через sudo.'; exit 1; fi
test -x /usr/sbin/rtcwake || { echo 'Нет rtcwake.'; exit 1; }
test -e /sys/class/rtc/rtc0/wakealarm || { echo 'Нет аппаратного таймера пробуждения.'; exit 1; }
if [ -n "$(cat /sys/class/rtc/rtc0/wakealarm)" ]; then echo 'Уже установлен другой таймер: тест отменён.'; exit 1; fi
if pgrep -f '[n]ode run.js' >/dev/null; then echo 'Роботы сейчас считают: тест отменён. Повторите после завершения.'; exit 1; fi
# Не пересекать ближайший обычный запуск cron каждые 5 минут.
now=$(date +%s)
remaining=$((300 - now % 300))
if [ "$remaining" -lt 110 ]; then echo 'Скоро запуск роботов. Повторите тест после очередного запуска и окончания расчёта.'; exit 1; fi
echo 'Тест сна на 60 секунд. SSH временно перестанет отвечать.'
echo 'После этого команда должна продолжиться сама. Постоянное расписание не меняется.'
echo 'Запускайте только когда ноутбук можно при необходимости разбудить вручную.'
printf 'Для запуска введите TEST: '
read -r answer
test "$answer" = TEST || { echo 'Отменено.'; exit 1; }
# Подтверждение могло занять время: повторно проверяем окно и отсутствие расчёта.
now=$(date +%s)
remaining=$((300 - now % 300))
if [ "$remaining" -lt 110 ] || pgrep -f '[n]ode run.js' >/dev/null; then echo 'Окно для теста прошло, повторите позже.'; exit 1; fi
date -Iseconds
/usr/sbin/rtcwake -m mem -s 60
after=$(date +%s)
elapsed=$((after - now))
printf 'Команда продолжилась через %s секунд.\n' "$elapsed"
date -Iseconds
echo 'Состояние сети и Tailscale после возобновления:'
systemctl is-active NetworkManager tailscaled || true
echo 'Проверьте повторное SSH-подключение и страницу статуса с телефона.'
echo 'Этот тест проверяет сон; включение после полного выключения им не подтверждается.'
