#!/bin/sh
# node2shell-lab r1 — retire the target (frees port 18993 + network).
set -eu
cd "$(dirname "$0")"
docker compose down -t 2 2>&1 | tail -1
echo TEARDOWN_OK
