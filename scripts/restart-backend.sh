#!/bin/bash
# Kill existing backend and restart
PID_FILE="/tmp/n0va-backend.pid"

if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Stopping backend (PID $OLD_PID)..."
        kill "$OLD_PID" 2>/dev/null
        sleep 1
    fi
    rm -f "$PID_FILE"
fi

# Also try pkill as fallback
pkill -f "node.*server.js" 2>/dev/null

exec bash "$(dirname "$0")/start-backend.sh"
