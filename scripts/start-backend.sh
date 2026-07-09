#!/bin/bash
# Start n0va backend securely — writes PID, survives shell disconnection

BACKEND_DIR="$(cd "$(dirname "$0")/../backend" && pwd)"
LOG_FILE="/tmp/n0va-backend.log"
PID_FILE="/tmp/n0va-backend.pid"

# Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Backend already running (PID $OLD_PID) — http://localhost:3001"
        exit 0
    fi
    rm -f "$PID_FILE"
fi

cd "$BACKEND_DIR" || exit 1
node server.js > "$LOG_FILE" 2>&1 &
BGPID=$!
echo "$BGPID" > "$PID_FILE"
echo "n0va backend started (PID $BGPID)"
echo "  API:  http://localhost:3001"
echo "  Logs: $LOG_FILE"
