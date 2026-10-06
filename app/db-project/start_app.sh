#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
printf 'Apri http://127.0.0.1:4173 — Ctrl+C per arrestare il server.\n'
if [ -x .venv/bin/python ]; then
  exec .venv/bin/python server.py
fi
exec python3 server.py
