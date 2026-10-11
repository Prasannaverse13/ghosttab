#!/bin/sh
# One container: the mint (+ site + /demo gateway) and the demo seller APIs.
npx tsx packages/server/src/index.ts &
MINT_PID=$!
# wait for the mint before the demo sellers register with it
for i in $(seq 1 30); do
  wget -qO- "http://localhost:${PORT:-8080}/v1/info" >/dev/null 2>&1 && break
  sleep 1
done
GHOSTTAB_MINT="http://localhost:${PORT:-8080}" DEMO_PORT=4020 npx tsx apps/demo/src/apis.ts &
wait $MINT_PID
