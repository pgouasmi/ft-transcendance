#!/bin/sh

SERVER_ADDRESS="localhost:7777"

# Get token
response=$(curl -k -s "https://${SERVER_ADDRESS}/auth/getguesttoken/")
token=$(echo "$response" | jq -r '.access_token')

echo "Token: $token"

[ -z "$token" ] && { echo "Failed to get token"; exit 1; }

# Try to join game
join_response=$(curl -k -s -H "Authorization: Bearer $token" \
    "https://${SERVER_ADDRESS}/game/join/?mode=PVP&option=1")

game_uid=$(echo "$join_response" | jq -r '.uid')
if [ "$game_uid" != "null" ]; then
    echo "Joined game: $game_uid"
    wscat -c "wss://${SERVER_ADDRESS}/ws/pong/${game_uid}/" --no-check -s "token_${token}" \
		-w 10 \
        -x '{"type":"greetings","sender":"cli"}' \
        -w 20 \
        -x '{"type":"start", "data": "init", "sender":"cli"}' \
		-w 30 \
		-x '{"type":"pong","sender":"cli"}'
else
    echo "No game available to join"
fi