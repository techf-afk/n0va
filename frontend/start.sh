#!/bin/bash
# Tool Orchestrator Startup Script

echo "🔧 Starting Tool Orchestrator..."
echo ""

# Check if 9router is running
if ! curl -s http://127.0.0.1:20128 > /dev/null 2>&1; then
  echo "⚠️  WARNING: 9router doesn't seem to be running on port 20128"
  echo "   The AI features won't work without it."
  echo ""
fi

# Start the platform
echo "🚀 Starting backend and frontend..."
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop both services"
echo ""

npm run dev
