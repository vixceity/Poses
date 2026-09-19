"""Run with python cam.py, then open http://127.0.0.1:8000."""
import asyncio
from contextlib import asynccontextmanager
import json
import logging
import os
from pathlib import Path
import threading
import time
import uuid

import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from database import Database
from pose_processing import EDGES, JOINTS, assign_lanes, normalize

ROOT = Path(__file__).resolve().parent
log = logging.getLogger('poses')


class CameraHost:
    def __init__(self):
        self.lock = threading.RLock()
        self.stop = threading.Event()
        self.db = Database()
        self.game_id = None
        self.state = None
        self.jpeg = None
        self.status = 'Starting camera'
        self.visible = []
        self.thread = threading.Thread(target=self.run, daemon=True)

    def start_game(self, tolerance, timeout):
        with self.lock:
            game_id = uuid.uuid4().hex
            self.db.connect()
            self.db.call('create_game', game_id, tolerance, timeout)
            self.game_id = game_id
            self.state = self.db.state(game_id)
            return game_id

    def run(self):
        capture = None
        detector = None
        try:
            model = Path(os.getenv('POSE_MODEL', str(ROOT / 'models/pose_landmarker_full.task')))
            if not model.is_file():
                raise RuntimeError('Pose model missing. Run python download_model.py first.')
            detector = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
                base_options=python.BaseOptions(model_asset_path=str(model)),
                running_mode=vision.RunningMode.VIDEO, num_poses=4,
                min_pose_detection_confidence=0.6, min_tracking_confidence=0.6))
            capture = cv2.VideoCapture(int(os.getenv('CAMERA_INDEX', '0')))
            if not capture.isOpened():
                raise RuntimeError('Cannot open camera. Check CAMERA_INDEX and camera permissions.')
            last_timestamp = 0
            while not self.stop.is_set():
                started = time.monotonic()
                ok, frame = capture.read()
                if not ok:
                    with self.lock:
                        self.status = 'Camera frame unavailable; copying deadlines continue'
                        self.visible = []
                        self.jpeg = None
                        self.send_observation({1: None, 2: None})
                    self.stop.wait(0.2)
                    continue
                timestamp = max(last_timestamp + 1, int(time.monotonic() * 1000))
                last_timestamp = timestamp
                result = detector.detect_for_video(mp.Image(
                    image_format=mp.ImageFormat.SRGB,
                    data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)), timestamp)
                lanes = assign_lanes(result.pose_landmarks)
                matrices = {p: normalize(result.pose_world_landmarks[i], result.pose_landmarks[i])
                            if i is not None else None for p, i in lanes.items()}
                height, width = frame.shape[:2]
                for player, index in lanes.items():
                    if index is None:
                        continue
                    landmarks = result.pose_landmarks[index]
                    points = [(int(landmarks[i].x * width), int(landmarks[i].y * height)) for i in JOINTS]
                    color = (80, 230, 100) if player == 1 else (255, 190, 80)
                    for a, b in EDGES:
                        cv2.line(frame, points[a], points[b], color, 2)
                    for point in points:
                        cv2.circle(frame, point, 4, color, -1)
                    cv2.putText(frame, f'P{player}', points[0], cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
                cv2.line(frame, (width // 2, 0), (width // 2, height), (180, 180, 180), 1)
                frame = cv2.flip(frame, 1)
                encoded, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                with self.lock:
                    if encoded:
                        self.jpeg = jpeg.tobytes()
                    self.visible = [p for p, matrix in matrices.items() if matrix is not None]
                    self.status = 'Camera ready'
                    self.send_observation(matrices)
                self.stop.wait(max(0, 0.12 - (time.monotonic() - started)))
        except Exception as exc:
            log.exception('Camera worker stopped')
            with self.lock:
                self.status = str(exc)
                self.jpeg = None
                self.visible = []
            # Still enforce game deadlines if detection fails permanently.
            while not self.stop.wait(0.25):
                with self.lock:
                    self.send_observation({1: None, 2: None})
        finally:
            if capture is not None:
                capture.release()
            if detector is not None:
                detector.close()

    def send_observation(self, matrices):
        if not self.game_id:
            return
        try:
            # Read first to recover correctly after a lost HTTP response.
            self.db.call('heartbeat', self.game_id)
            self.state = self.db.state(self.game_id)
            if self.state['phase'] != 'finished':
                player = self.state['setter'] if self.state['phase'] == 'setting' else 3 - self.state['setter']
                self.db.call('submit_frame', self.game_id, player, json.dumps(matrices[player]))
                self.state = self.db.state(self.game_id)
        except Exception:
            log.exception('SpacetimeDB request failed')
            self.status = 'SpacetimeDB unavailable; check server, database name and token'


host = CameraHost()


@asynccontextmanager
async def lifespan(app):
    host.thread.start()
    yield
    host.stop.set()
    await asyncio.to_thread(host.thread.join, 15)
    if not host.thread.is_alive():
        host.db.client.close()


app = FastAPI(title='POSES camera host', lifespan=lifespan)


class GameOptions(BaseModel):
    tolerance: float = Field(default=0.25, ge=0.05, le=0.8)
    timeout_seconds: int = Field(default=20, ge=5, le=120)


@app.get('/')
def index():
    return FileResponse(ROOT / 'static/index.html')


@app.post('/api/games')
def new_game(options: GameOptions):
    try:
        return {'id': host.start_game(options.tolerance, options.timeout_seconds)}
    except Exception as exc:
        log.exception('Could not create game')
        raise HTTPException(503, 'Could not create game. Check SpacetimeDB and the server log.') from exc


@app.get('/api/state')
def state():
    with host.lock:
        return {'id': host.game_id, 'game': host.state, 'status': host.status,
                'visible_players': host.visible, 'now': int(time.time() * 1000)}


@app.get('/camera.mjpg')
async def camera():
    async def frames():
        while not host.stop.is_set():
            # Bytes assignment is atomic; do not block the event loop on DB calls.
            jpeg = host.jpeg
            if jpeg:
                yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + jpeg + b'\r\n'
            await asyncio.sleep(0.12)
    return StreamingResponse(frames(), media_type='multipart/x-mixed-replace; boundary=frame')


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8000)
