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

# Kill caffeinate
if [ -f "$CAFF_PID_FILE" ]; then
  PID=$(cat "$CAFF_PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "  Caffeinate stopped"
  fi
  rm -f "$CAFF_PID_FILE"
fi

# Restore sleep settings
if sudo -n pmset -a disablesleep 0 2>/dev/null; then
  echo "  Sleep settings restored"
else
  echo "  Note: run 'sudo pmset -a disablesleep 0' to restore sleep"
fi

echo "Done."
