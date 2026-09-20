# POSES

POSES is a two-player camera game where players create and copy physical poses. The first player to spell **POSES** through failed copying rounds loses.

## Overview

The camera host detects both players, assigns them to lanes, normalizes their body landmarks, and sends pose observations to SpacetimeDB. The database validates holds, stores pose sequences, controls the timer, swaps roles, and records penalties. The frontend displays the live camera feed, target pose, progress, timer, and match result.

## Features

- Two-player local camera gameplay
- Full-body pose detection and lane assignment
- Three-pose sequences copied in order
- Two-second stable holds for recording and matching
- Configurable match tolerance and copying timer
- Automatic role swapping after successful rounds
- POSES failure letters and win/loss state
- Target photos, skeleton view, match replay, and reset controls
- Optional online multiplayer prototype with WebSocket rooms

## Technology Stack

| Area | Technology |
| --- | --- |
| Camera service | Python, FastAPI, Uvicorn, OpenCV |
| Pose detection | MediaPipe Pose Landmarker, NumPy |
| Game backend | SpacetimeDB 2.x, TypeScript reducers |
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Testing | Pytest, Node test runner, Playwright |
| Communication | HTTP APIs, camera MJPEG stream, WebSockets for the multiplayer prototype |

## Installation (Windows PowerShell)

Install [Python 3.11 or 3.12](https://www.python.org/downloads/), [Node.js 24+](https://nodejs.org/), and the [SpacetimeDB 2.x CLI](https://spacetimedb.com/docs/).

1. Clone the repository:

```powershell
git clone <repository-url>
cd Poses
```

2. Install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe download_model.py
Push-Location spacetimedb
npm.cmd ci
Pop-Location
Push-Location frontend
npm.cmd install
Pop-Location
```

3. Start SpacetimeDB in a separate terminal:

```powershell
spacetime start
```

4. Start the game services from the repository root:

```powershell
spacetime publish --server local --module-path spacetimedb poses
.\.venv\Scripts\python.exe cam.py
```

In another terminal, start the frontend:

```powershell
Push-Location frontend
npm.cmd run dev
Pop-Location
```

5. Open the game:

```text
http://127.0.0.1:3001
```

The camera is connected to the computer running `cam.py`. Run one camera service process without reload or multiple workers. The FastAPI service remains available at `http://127.0.0.1:8000`, with API documentation at `/docs`.

## Future Enhancements

- **Better UI:** Improve visual feedback, accessibility, responsive layouts, and in-game guidance.
- **Online multiplayer:** Complete browser-to-browser gameplay with remote cameras, synchronized rounds, and reliable matchmaking.
- **Simpler usage:** Reduce setup steps, automate service startup, improve device detection, and provide clearer troubleshooting.

## Development Checks

```powershell
Push-Location frontend
npm.cmd run check
npm.cmd test
Pop-Location
Push-Location spacetimedb
npm.cmd run check
npm.cmd test
Pop-Location
.\.venv\Scripts\python.exe -m pytest tests
```

These checks cover the game rules, pose normalization, lane assignment, frontend states, and browser layout.

For the online multiplayer prototype, start the relay in another terminal:

```powershell
.\.venv\Scripts\python.exe cam_multiplayer.py
```

Players on the same network can open `http://<host-ip>:8000`, choose Online game, create or join a room, and use their own device camera. The relay keeps camera video local and forwards room/game messages through WebSockets. The SpacetimeDB module includes the prepared online reducers, but the current multiplayer page still uses the relay as its transport.

## Playing

1. Player 1 stands in the left half of the unmirrored preview, Player 2 in the right. Keep full bodies visible and remain in your lanes. A center dead zone and ambiguous-lane rejection prevent uncertain observations from being scored. Additional detected people in a player's lane invalidate that lane until they leave.
2. Player 1 holds still for two seconds to save each of three poses. Move to a different pose between captures. The setter has 20 seconds for all three poses; expiry hands setting to the other player after a three-second countdown without awarding a letter.
3. A three-second get-ready countdown shows the first target without recording or using copying time. Then Player 2 copies the three poses **in order**, holding each for two seconds within the tolerance. The target skeleton and matrix appear beside the camera. The copying sequence has a 20-second deadline by default. Wrong poses can be retried until that deadline.
4. Copying all three swaps the setter role. Missing any deadline adds one letter to the copier, discards the sequence, and lets the same setter record three new poses.
5. The first player to accumulate **POSES** loses. Start a new game to play again; prior game rows remain stored in SpacetimeDB.

“Fails” means failing to copy the sequence before a deadline. A setter may take as long as needed. These rules apply symmetrically to both players.

## Matrices and tolerance

Each pose is a **24 × 3** matrix of xyz values from MediaPipe's estimated world landmarks. The first twelve rows are left/right shoulders, elbows, wrists, hips, knees, and ankles, in that order. Subtracting the midpoint of the hips centers the skeleton at the origin. Dividing by the shoulder-midpoint-to-hip-midpoint distance compensates for player size. The remaining twelve rows are directed limb vectors using `EDGES` in `pose_processing.py` (each endpoint is expressed in the same hip-centered coordinates).

SpacetimeDB compares matrices using root-mean-square Euclidean row distance. Default match tolerance is **0.25 torso lengths**; increase it in the UI to make copying easier. A stable hold must remain within 0.8 of its starting matrix for two seconds, with no observation gap over 1.5 seconds. A setter must move at least 0.20 from the captured pose before recording again. Missing or low-confidence joints reset the hold. Left/right and body orientation are preserved; poses are not mirrored or rotationally aligned. The displayed target is the xy projection of the 3D matrix.

## Configuration

Set environment variables before starting `cam.py`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `CAMERA_INDEX` | Auto: `1`, then `0` | Prefer second webcam; fall back to first if it cannot deliver frames. An explicit value selects only that device. |
| `POSE_MODEL` | `models/pose_landmarker_full.task` | Local MediaPipe task model |
| `SPACETIMEDB_URL` | `http://127.0.0.1:3000` | Database server |
| `SPACETIMEDB_DATABASE` | `poses` | Published database name |
| `SPACETIMEDB_TOKEN` | Automatically created | Camera host identity token |

The host persists its automatically created token in the ignored `.spacetime-token` file. Only the identity that creates a game may submit observations or tick it. Game rows are public to allow reads. The FastAPI control endpoints are intended for this localhost installation, not an authenticated internet service.

This prototype uses SpacetimeDB's [HTTP reducer and SQL APIs](https://spacetimedb.com/docs/http/database/) at roughly eight observations per second. HTTP is convenient for Python integration but adds overhead; a remote database may make the 600 ms continuity requirement difficult to meet. Run the database locally. The host sends heartbeat reducers even when camera frames are unavailable. Deadlines are evaluated using database time on heartbeats and observations; if the host disconnects, expiration is processed on its next request. There is no autonomous scheduled timeout while the host is stopped. Restarting the camera service requires starting a new game in the UI.

Lane assignment is deliberate: this version does not perform biometric re-identification when people cross or swap sides. Monocular depth is approximate; use good lighting, enough room, and unobstructed limbs.

Implementation references: [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/python), [SpacetimeDB reducers](https://spacetimedb.com/docs/functions/reducers/), and [publishing modules](https://spacetimedb.com/docs/databases/building-publishing/).
