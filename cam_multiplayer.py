"""Run with python cam_multiplayer.py for cross-device room relay play."""
import asyncio
import json
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

ROOT = Path(__file__).resolve().parent
rooms: dict[str, dict[str, WebSocket]] = {}


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
    try:
        await websocket.send_json({'type': 'state', 'room': room, 'players': sorted(rooms[room])})
        await broadcast(room, {'type': 'state', 'room': room, 'players': sorted(rooms[room])})
        while True:
            message = json.loads(await websocket.receive_text())
            if message.get('type') not in {'pose', 'game'}:
                continue
            await broadcast(room, {**message, 'player': player}, exclude=websocket)
    except (WebSocketDisconnect, json.JSONDecodeError):
        pass
    finally:
        if rooms.get(room, {}).get(player) is websocket:
            rooms[room].pop(player, None)
        if room in rooms:
            await broadcast(room, {'type': 'state', 'room': room, 'players': sorted(rooms[room])})
            if not rooms[room]:
                rooms.pop(room, None)


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8001)
