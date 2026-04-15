#!/bin/bash
# Claude Remote - Stop Script
DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$DIR/.claude-remote.pid"
CAFF_PID_FILE="$DIR/.caffeinate.pid"

echo "Stopping Claude Remote..."

# Kill server
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "  Server stopped (PID: $PID)"
  fi
  rm -f "$PID_FILE"
fi

# Kill caffeinate (tracked pid + sweep orphans from prior crashed runs)
if [ -f "$CAFF_PID_FILE" ]; then
  PID=$(cat "$CAFF_PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "  Caffeinate stopped (PID: $PID)"
  fi
  rm -f "$CAFF_PID_FILE"
fi
# Sweep any leftover `caffeinate -s` owned by this user (orphans from earlier
# starts that crashed before stop.sh ran — pidfile would have been overwritten).
ORPHANS=$(pgrep -u "$USER" -f '^caffeinate -s$' 2>/dev/null || true)
if [ -n "$ORPHANS" ]; then
  echo "$ORPHANS" | xargs kill 2>/dev/null || true
  echo "  Orphan caffeinate swept: $(echo "$ORPHANS" | tr '\n' ' ')"
fi

# Restore sleep settings
if sudo -n pmset -a disablesleep 0 2>/dev/null; then
  echo "  Sleep settings restored"
else
  echo "  Note: run 'sudo pmset -a disablesleep 0' to restore sleep"
fi

echo "Done."
