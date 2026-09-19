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
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
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
        self.ready_hold_ms = 0
        self.ready_players = []
        self.ready_since = None
        self.ready_armed = True
        self.ready_latched = False
        self.pose_photos = {}
        self.thread = threading.Thread(target=self.run, daemon=True)

    def start_game(self, tolerance, timeout):
        with self.lock:
            if not self.ready_armed or not self.ready_latched:
                raise ValueError('Both players must hold up a hand for two seconds.')
            game_id = uuid.uuid4().hex
            self.db.connect()
            self.db.call('create_game', game_id, tolerance, timeout)
            self.game_id = game_id
            self.state = self.db.state(game_id)
            self.pose_photos = {}
            self.ready_hold_ms = 0
            self.ready_players = []
            self.ready_since = None
            self.ready_armed = False
            self.ready_latched = False
            return game_id

    def reset_game(self):
        with self.lock:
            self.game_id = None
            self.state = None
            self.pose_photos = {}
            self.ready_players = []
            self.ready_hold_ms = 0
            self.ready_since = None
            # Require a camera-observed release before accepting another hold.
            self.ready_armed = False
            self.ready_latched = False

    def update_ready_gesture(self, landmarks, lanes, now):
        players = []
        for player, index in lanes.items():
            if index is None:
                continue
            pose = landmarks[index]
            # At least one wrist must be above its corresponding shoulder.
            left_hand_up = pose[15].y < pose[11].y - 0.04 and pose[15].y < pose[13].y
            right_hand_up = pose[16].y < pose[12].y - 0.04 and pose[16].y < pose[14].y
            hands_up = left_hand_up or right_hand_up
            if hands_up:
                players.append(player)
        self.ready_players = players
        if len(players) != 2:
            self.ready_since = None
            self.ready_hold_ms = 0
            self.ready_armed = True
            return
        if not self.ready_armed:
            self.ready_since = None
            self.ready_hold_ms = 0
            return
        if self.ready_since is None:
            self.ready_since = now
        self.ready_hold_ms = min(2000, now - self.ready_since)
        if self.ready_hold_ms >= 2000:
            self.ready_latched = True

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
            requested_index = os.getenv('CAMERA_INDEX')
            camera_indices = [int(requested_index)] if requested_index is not None else [1, 0]
            backend = cv2.CAP_DSHOW if os.name == 'nt' else cv2.CAP_ANY
            for camera_index in camera_indices:
                candidate = cv2.VideoCapture(camera_index, backend)
                if not candidate.isOpened() and backend != cv2.CAP_ANY:
                    candidate.release()
                    candidate = cv2.VideoCapture(camera_index)
                if candidate.isOpened():
                    capture = candidate
                    break
                candidate.release()
            if capture is None or not capture.isOpened():
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
                now = int(time.monotonic() * 1000)
                with self.lock:
                    if not self.game_id or not self.state or self.state.get('phase') == 'finished':
                        self.update_ready_gesture(result.pose_landmarks, lanes, now)
                    else:
                        self.ready_players = []
                        self.ready_since = None
                        self.ready_hold_ms = 0
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
                self.ready_players = []
                self.ready_since = None
                self.ready_hold_ms = 0
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
            if self.state['phase'] in ('setting', 'copying'):
                before = self.state
                player = self.state['setter'] if self.state['phase'] == 'setting' else 3 - self.state['setter']
                self.db.call('submit_frame', self.game_id, player, json.dumps(matrices[player]))
                self.state = self.db.state(self.game_id)
                self.capture_saved_pose(before, self.state)
        except Exception:
            log.exception('SpacetimeDB request failed')
            self.status = 'SpacetimeDB unavailable; check server, database name and token'

    def capture_saved_pose(self, before, after):
        if (not self.jpeg or before['phase'] != 'setting'
                or before['round'] != after['round']
                or len(after['poses']) != len(before['poses']) + 1):
            return
        frame = cv2.imdecode(np.frombuffer(self.jpeg, np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            return
        # The preview is already mirrored: P1 occupies its left half.
        half = frame.shape[1] // 2
        crop = frame[:, :half] if before['setter'] == 1 else frame[:, half:]
        crop = cv2.resize(crop, (320, max(1, round(crop.shape[0] * 320 / crop.shape[1]))))
        ok, encoded = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if ok:
            self.pose_photos[(after['round'], len(after['poses']) - 1)] = encoded.tobytes()


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
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        'http://127.0.0.1:3001',
        'http://localhost:3001',
    ],
    allow_methods=['GET', 'POST'],
    allow_headers=['Content-Type'],
)
app.mount('/voiceover', StaticFiles(directory=ROOT / 'voiceover'), name='voiceover')
app.mount('/assets/audio', StaticFiles(directory=ROOT / 'assets' / 'audio'), name='voiceover-audio')


class GameOptions(BaseModel):
    tolerance: float = Field(default=0.25, ge=0.05, le=0.8)
    timeout_seconds: int = Field(default=20, ge=5, le=120)


@app.get('/')
def index():
    return FileResponse(ROOT / 'static/main.html')


@app.get('/poses-graffiti.png')
def logo():
    return FileResponse(ROOT / 'static/poses-graffiti.png')


@app.get('/local')
def local_index():
    return FileResponse(ROOT / 'static/index.html')


@app.post('/api/games')
def new_game(options: GameOptions):
    try:
        return {'id': host.start_game(options.tolerance, options.timeout_seconds)}
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    except Exception as exc:
        log.exception('Could not create game')
        raise HTTPException(503, 'Could not create game. Check SpacetimeDB and the server log.') from exc


@app.post('/api/games/reset')
def reset_game():
    host.reset_game()
    return {'ok': True}


@app.get('/api/state')
def state():
    with host.lock:
        return {'id': host.game_id, 'game': host.state, 'status': host.status,
                'camera_ready': host.jpeg is not None,
                'pose_photos': [{'round': r, 'index': i,
                                 'url': f'/api/games/{host.game_id}/photos/{r}/{i}'}
                                for r, i in host.pose_photos],
                'visible_players': host.visible, 'ready_players': host.ready_players,
                'ready_hold_ms': host.ready_hold_ms, 'now': int(time.time() * 1000)}


@app.get('/api/games/{game_id}/photos/{round_number}/{pose_index}')
def pose_photo(game_id: str, round_number: int, pose_index: int):
    with host.lock:
        photo = host.pose_photos.get((round_number, pose_index)) if game_id == host.game_id else None
    if photo is None:
        raise HTTPException(404, 'Pose photo unavailable')
    return Response(content=photo, media_type='image/jpeg', headers={'Cache-Control': 'no-store'})


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


@app.get('/camera.jpg')
def camera_snapshot():
    if not host.jpeg:
        raise HTTPException(503, 'Camera frame unavailable')
    return Response(content=host.jpeg, media_type='image/jpeg')


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8000)
