#!/bin/sh
# PID 1 supervisor (root). Restarts the gateway after engine crashes and
# keeps an ops-visible restart ledger in /run/ledger/state.json.
# The sealed proof stays root-owned (0600); the gateway receives it only as
# fd 3 (heap-only in the child; the path is unreachable for the node user
# because /root is 0700).
set -eu

STATE=/run/ledger/state.json
[ -f "$STATE" ] || printf '{"restarts":0,"crashes":0,"last_exit":"none"}\n' > "$STATE"
touch /var/log/ledger-supervisor.log
chmod 0640 /var/log/ledger-supervisor.log
chgrp node /var/log/ledger-supervisor.log

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >> /var/log/ledger-supervisor.log; }

while true; do
  RESTARTS=$(sed -n 's/.*"restarts":\([0-9]*\).*/\1/p' "$STATE" 2>/dev/null || echo 0)
  [ -n "$RESTARTS" ] || RESTARTS=0

  exec 3< /root/.sealed
  # Drop to the node user for the child; fd 3 survives the exec.
  chroot --userspec=1000:1000 / node /app/server.js &
  CHILD=$!
  exec 3<&-

  CODE=0
  wait "$CHILD" || CODE=$?
  if [ "$CODE" -eq 0 ]; then
    log "clean exit"
    exit 0
  fi

  RESTARTS=$((RESTARTS + 1))
  printf '{"restarts":%d,"crashes":%d,"last_exit":%d}\n' \
    "$RESTARTS" "$RESTARTS" "$CODE" > "$STATE"
  log "unclean exit code=$CODE restarts=$RESTARTS"
  sleep 0.3
done
