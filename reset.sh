#!/bin/sh
# node2shell-lab r2 — one-command factory reset (wipe crash ledger + receipts,
# fresh container, attest re-sealed).
set -eu
cd "$(dirname "$0")"
docker compose down -t 2 >/dev/null 2>&1 || true
docker compose up -d 2>&1 | tail -1
sleep 4
curl -sf -m 5 http://127.0.0.1:18993/api/health && echo && echo RESET_OK
