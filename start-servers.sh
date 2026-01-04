#!/bin/bash

echo "🚀 Starting Chess App Servers..."

# Start the save game server in the background
echo "📝 Starting Save Game Server on port 3001..."
node save-game-server.js &
SAVE_SERVER_PID=$!

# Wait a moment for the save server to start
sleep 2

# Start the main web server
echo "🌐 Starting Web Server on port 8084..."
python3 -m http.server 8084 &
WEB_SERVER_PID=$!

echo "✅ Both servers started!"
echo "📝 Save Game Server: http://localhost:3001"
echo "🌐 Web Server: http://localhost:8084"
echo ""
echo "Press Ctrl+C to stop both servers"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $SAVE_SERVER_PID 2>/dev/null
    kill $WEB_SERVER_PID 2>/dev/null
    echo "✅ Servers stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Wait for either process to exit
wait
