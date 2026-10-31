#!/usr/bin/env bash
# Starts the dev server and opens the game in the browser.
#
#   ./start.sh            port 8137
#   ./start.sh 9000       another port
#   ./start.sh --no-open  server only
#
# If Vulcano is already served on the port, it only opens the browser; if the
# port is taken by something else, it stops with an error rather than opening
# the wrong page.

set -euo pipefail

cd "$(dirname "$0")"

port=8137
open=1
for arg in "$@"; do
  case "$arg" in
    --no-open) open=0 ;;
    ''|*[!0-9]*) echo "Uso: $0 [porta] [--no-open]" >&2; exit 2 ;;
    *) port="$arg" ;;
  esac
done
url="http://localhost:${port}/"

command -v python3 >/dev/null || { echo "Serve python3." >&2; exit 1; }

open_browser() {
  [ "$open" = 1 ] || return 0
  if command -v xdg-open >/dev/null; then
    xdg-open "$url" >/dev/null 2>&1 &
  elif command -v open >/dev/null; then
    open "$url"
  else
    echo "Apri $url nel browser."
  fi
}

# Is something already answering on the port, and is it us?
if page=$(curl -fsS --max-time 2 "$url" 2>/dev/null); then
  if grep -q '<title>Vulcano</title>' <<<"$page"; then
    echo "Vulcano è già in esecuzione su $url"
    open_browser
    exit 0
  fi
  echo "La porta $port è occupata da un'altra applicazione. Prova: $0 <altra porta>" >&2
  exit 1
fi

echo "Vulcano su $url — Ctrl+C per fermare."
# Open once the server answers, without holding up the server in the foreground.
(
  for _ in $(seq 1 50); do
    curl -fsS --max-time 1 "$url" >/dev/null 2>&1 && { open_browser; exit 0; }
    sleep 0.1
  done
) &
exec python3 tools/serve.py "$port"
