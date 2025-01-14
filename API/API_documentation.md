# Astropong API Documentation

## 📡 Authentication Workflow

### Token Acquisition
#### ⚠️ SSL certificate is self signed, use -k on curl
#### ⚠️ Use -s on curl to silence transfer logs
- **Endpoint**: `https://<server_address>:7777/auth/getguesttoken/`
- **Method**: GET
- **Response**: Authentication Token. Format = `{"access_token": "<token>"}`
- **Received token format**: `Bearer <token>`
- **Example**: `TOKEN=$(curl -k -s https://10.10.10.10:7777/auth/getguesttoken/ | jq -r '.access_token')`

## 🔌 Game Request and Connection Workflow

### Game Creation/Join
#### ⚠️ SSL certificate is self signed, use -k on curl

#### Join PVP Game
- **Endpoint**: `https://<server_address>/game/join/?mode=PVP&option=<option>`
- **Method**: GET
- **Required Headers**:
  * Authorization: Bearer {token}
- **Response**: 
  * Success (200): Unique Game ID, Format = `{"uid": "<uid>"}`
  * Not Found (404): No available game to join
- **Example**: `UID=$(curl -k -s -H "Authorization: $TOKEN" https://10.10.10.10:7777/game/join/\?mode\=PVP\&option=1)`

#### Create Game
- **Endpoint**: `https://<server_address>/game/create/?mode=<mode>&option=<option>`
- **Arguments**:
    * mode: 'PVE' for a game against AI, 'PVP' to play online against another player
    * option:
        - If the mode is PVE: '1' for easy, '2' for medium, '3' for hard AI difficulty
        - If the mode is PVP: option must be '1'
- **Method**: GET
- **Required Headers**:
  * Authorization: Bearer {token}
- **Response**: Unique Game ID, Format = `{"uid": "<uid>"}`
- **Example**: `UID=$(curl -k -s -H "Authorization: $TOKEN" https://10.10.10.10:7777/game/create/\?mode\=PVE\&option=3)` -> requesting a game against a hard difficulty AI

### WebSocket Connection
#### ⚠️ SSL certificate is self signed, use --no-check on wscat
- **Protocol**: WSS
- **Sub-protocol**: Authentication Token. Format = `token_<raw_token>` (raw token without "Bearer " prefix)
- **Endpoint**: `wss://<server_address>:7777/ws/pong/<game_uid>/`
- **Parameters**: 
  * Game ID
- **Example**: `wscat -c wss://10.10.10.10:7777/ws/pong/${UID}/ --no-check -s "token_${TOKEN#"Bearer "}">`

## 🚀 Game Workflow

⚙️ **Game settings:**:
- *Terrain proportions*: 3/2, on server it is calculated on 1500px * 1000px
- *Paddle proportions*: Paddle's width is terrain's height (1500px) // 150 and paddle's height is terrain's height (1500px) // 6
- *Ball radius*: terrain's height // 100
- *Values normalization*: x: 0.0 - 1.0, y: 0.0 - 1.0, speed: 0.0 - 1.0

️**⚠️ Be careful, if you send a malformed message, your socket will be closed and you will lose the game**

### Connection Sequence
1. **Server sends greeting**: `{"type": "greetings", "side": "<side>"}`. Side p1 means you are on the left side, p2 means right side.
2. **Client greets back**: `{"type": "greetings", "sender": "cli"}`
3. **Server may send opponent status**: `{"type": "opponent_connected", "opponent_connected": true}`
4. **Client starts game**: `{"type": "start", "sender": "cli"}`

### Game State Messages
The server sends game state JSON every 1/60s:
```json
{
    "type": "None",
    "ball": {
        "x": 0.6,
        "y": 0.6,
        "speed": 0.3,
        "lastTouch": "2",
        "touchedWall": null,
        "rounded_angle": 2.5
    },
    "paddle1": {
        "x": 0.2,
        "y": 0.5,
        "score": 0
    },
    "paddle2": {
        "x": 0.9,
        "y": 0.4,
        "score": 1
    },
    "goal": null,
    "gameover": null,
    "winner": null
}
```

### Player Input
To move your paddle, send:
```json
{
    "type": "keyDown",
    "player": "p1",
    "value": [1, 0],
    "sender": "cli"
}
```
- `player` should match your assigned side (p1 or p2)
- `value` is an array [vertical, horizontal] where:
  - vertical: 1 for up, -1 for down, 0 for stop
  - horizontal: should always be 0
  - if your side is 1, you must put your input in value[0], otherwise in value[1]

### Goal Scoring
When a goal is scored:
1. Server sends game state with `"goal": "1"` or `"goal": "2"` (scoring player)
2. Client should wait for animation/display
3. Client sends: `{"type": "resumeOnGoal", "sender": "cli"}`

### Game Over
Server sends game state with:
- `"gameover": "Score"`
- `"winner": "self"` or `"adversary"`

## 🚨 Error Codes
- `401`: Invalid Authentication
- `403`: Access Denied
- `404`: Resource Not Found
- `500`: Server Error

## 🔒 Security Best Practices
- Use HTTPS/WSS

## 📝 Versioning
- API Version: 1.1
- Documentation Last Updated: 2024/12/12