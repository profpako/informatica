#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
printf 'Apri http://127.0.0.1:4173 — Ctrl+C per arrestare il server.\n'
exec python3 -m http.server 4173 --bind 127.0.0.1
