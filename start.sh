#!/bin/bash
# Claude Remote - Start Script
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$DIR/.claude-remote.pid"
CAFF_PID_FILE="$DIR/.caffeinate.pid"

# Check if already running
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Already running (PID: $(cat "$PID_FILE"))"
  echo "Run ./stop.sh first"
  exit 1
fi

echo ""
echo "=== Claude Remote ==="
echo ""

# 1. Prevent sleep (battery + lid close)
echo "[1/3] Preventing Mac sleep..."
# Clean up any prior caffeinate from a crashed run before spawning a new one,
# otherwise the old assertion leaks and Mac never sleeps after stop.sh.
if [ -f "$CAFF_PID_FILE" ]; then
  OLD_CAFF=$(cat "$CAFF_PID_FILE")
  if kill -0 "$OLD_CAFF" 2>/dev/null; then
    kill "$OLD_CAFF" 2>/dev/null || true
  fi
  rm -f "$CAFF_PID_FILE"
fi
OLD_ORPHANS=$(pgrep -u "$USER" -f '^caffeinate -s$' 2>/dev/null || true)
[ -n "$OLD_ORPHANS" ] && echo "$OLD_ORPHANS" | xargs kill 2>/dev/null || true
caffeinate -s &
echo $! > "$CAFF_PID_FILE"

# Try pmset (needs sudo for lid-close prevention)
if sudo -n pmset -a disablesleep 1 2>/dev/null; then
  echo "  disablesleep=1 (lid close won't sleep)"
else
  echo "  Note: run 'sudo pmset -a disablesleep 1' manually for lid-close prevention"
fi

# 2. Generate password if not set
if [ -z "$PASSWORD" ]; then
  export PASSWORD=$(openssl rand -hex 4)
fi

# 3. Start server
echo "[2/3] Starting server..."
cd "$DIR"
node server.js &
SERVER_PID=$!
echo $SERVER_PID > "$PID_FILE"

echo "[3/3] Ready!"
echo ""
echo "  PID: $SERVER_PID"
echo ""

# Wait for server
wait $SERVER_PID
