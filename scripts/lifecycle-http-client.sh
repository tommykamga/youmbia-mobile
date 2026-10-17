#!/usr/bin/env bash
# Client HTTP minimal via /dev/tcp — destiné à tourner DANS un conteneur (réseau --internal).
# Usage: lifecycle-http-client.sh METHOD HOST PORT PATH [BODY] [HEADER_LINES...]
set -euo pipefail
METHOD=${1:?method}
HOST=${2:?host}
PORT=${3:?port}
PATHQ=${4:?path}
shift 4
BODY=${1:-}
if [[ $# -gt 0 ]]; then shift; fi
HEADERS=("$@")

{
  printf '%s %s HTTP/1.1\r\n' "$METHOD" "$PATHQ"
  printf 'Host: %s\r\n' "$HOST"
  printf 'Connection: close\r\n'
  for h in "${HEADERS[@]}"; do
    [[ -n "$h" ]] && printf '%s\r\n' "$h"
  done
  if [[ -n "$BODY" ]]; then
    printf 'Content-Type: application/json\r\n'
    printf 'Content-Length: %s\r\n' "${#BODY}"
  fi
  printf '\r\n'
  [[ -n "$BODY" ]] && printf '%s' "$BODY"
} > /tmp/lifecycle_http_req.bin

exec 3<>"/dev/tcp/${HOST}/${PORT}"
cat /tmp/lifecycle_http_req.bin >&3
timeout 15 cat <&3 || true
