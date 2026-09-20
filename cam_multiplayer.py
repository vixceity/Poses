"""Run with python cam_multiplayer.py for cross-device room relay play."""
import json
import os
import secrets
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

ROOT = Path(__file__).resolve().parent
rooms: dict[str, dict[str, WebSocket]] = {}

frontend_origins = {
    origin.strip().rstrip('/')
    for origin in os.getenv('POSES_FRONTEND_ORIGINS', '').split(',')
    if origin.strip()
}
frontend_origins.update({
    'http://127.0.0.1:3001',
    'http://localhost:3001',
    'http://127.0.0.1:8001',
    'http://localhost:8001',
})


def room_code() -> str:
    while True:
        code = secrets.token_urlsafe(4).upper().replace('-', 'A').replace('_', 'B')[:6]
        if code.isalnum() and code not in rooms:
            return code


async def broadcast(room: str, message: dict, exclude: WebSocket | None = None) -> None:
    payload = json.dumps(message)
    for connection in list(rooms.get(room, {}).values()):
        if connection is exclude:
            continue
        try:
            await connection.send_text(payload)
        except Exception:
            pass


app = FastAPI(title='POSES multiplayer relay')
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(frontend_origins),
    allow_methods=['GET', 'POST', 'OPTIONS'],
    allow_headers=['*'],
)


@app.get('/')
def multiplayer_page():
    return FileResponse(ROOT / 'static/multiplayer.html')


@app.post('/api/rooms')
def create_room():
    code = room_code()
    rooms[code] = {}
    return {'room': code}


@app.websocket('/ws/{room}/{player}')
async def room_socket(websocket: WebSocket, room: str, player: str):
    room = room.upper()
    if player not in {'1', '2'} or not room.isalnum() or len(room) > 8:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    rooms.setdefault(room, {})[player] = websocket
    participants = sorted(rooms[room])

    try:
        await websocket.send_json({'type': 'state', 'room': room, 'players': participants})
        await broadcast(room, {'type': 'state', 'room': room, 'players': participants}, exclude=websocket)

        while True:
            message = json.loads(await websocket.receive_text())
            message_type = message.get('type')
            allowed_types = {'pose', 'game', 'offer', 'answer', 'candidate', 'ready', 'start', 'signal'}
            if message_type not in allowed_types:
                continue
            payload = {**message, 'player': player}
            await broadcast(room, payload, exclude=websocket)
    except (WebSocketDisconnect, json.JSONDecodeError):
        pass
    finally:
        room_players = rooms.get(room, {})
        if room_players.get(player) is websocket:
            room_players.pop(player, None)
        if room in rooms:
            remaining = sorted(rooms[room])
            await broadcast(room, {'type': 'state', 'room': room, 'players': remaining})
            if not rooms[room]:
                rooms.pop(room, None)


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8001)
