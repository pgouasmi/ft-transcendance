#!/bin/bash

npm install -g wscat

# Get local IP address
IP_ADDRESS=$(ip addr | awk '/inet / {if(++n==2)print $2}' | cut -d/ -f1)
echo "Local IP Address: $IP_ADDRESS"

# Define server address - replace with your server address
SERVER_ADDRESS="localhost:7777"
echo "Server Address: $SERVER_ADDRESS"

# Get authentication token
echo "Requesting authentication token..."
TOKEN=$(curl -k -s https://${SERVER_ADDRESS}/auth/getguesttoken/ | jq -r '.access_token')
if [ -z "$TOKEN" ]; then
    echo "Error: Failed to get authentication token"
    exit 1
fi
echo "Token received successfully"

# Add Bearer prefix for API requests
AUTH_TOKEN="$TOKEN"

# Create a game (PVE against hard AI)
echo "Creating a game against hard AI..."
# UID=$(curl -k -s -H "Authorization: $AUTH_TOKEN" https://${SERVER_ADDRESS}/game/create/\?mode\=PVE\&option\=3 | jq -r '.uid')
UID=$(curl -k -s -H "Authorization: $AUTH_TOKEN" https://${SERVER_ADDRESS}/game/join/\?mode\=PVP\&option\=1 | jq -r '.uid')

#check if UID is 'null'
if [ "$UID" = "null" ]; then
    echo "Error: Failed to create game"
    exit 1
fi
echo "Game created with UID: $UID"

# Connect to WebSocket
echo "Connecting to game websocket..."
# Remove "Bearer " prefix for websocket token
WS_TOKEN=${AUTH_TOKEN#"Bearer "}
wscat -c wss://${SERVER_ADDRESS}/ws/pong/${UID}/ --no-check -s "token_${WS_TOKEN}"

# Start game JSON:
# {"type": "start", "sender": "cli"}

# Alternative commands:
# Try to join an existing PVP game:
# UID=$(curl -k -s -H "Authorization: $AUTH_TOKEN" https://${SERVER_ADDRESS}/game/join/\?mode\=PVP\&option\=1 | jq -r '.uid')

# Create a new PVP game:
# UID=$(curl -k -s -H "Authorization: $AUTH_TOKEN" https://${SERVER_ADDRESS}/game/create/\?mode\=PVP\&option\=1 | jq -r '.uid')