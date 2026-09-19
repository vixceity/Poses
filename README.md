# POSES

A local two-player camera game. OpenCV captures the webcam; MediaPipe detects up to four people; FastAPI serves the camera preview and sends normalized observations to SpacetimeDB. SpacetimeDB owns the two-second hold checks, saved pose matrices, comparisons, deadlines, rounds, letters, and winner. There is no in-memory fallback game engine.

## Setup (Windows PowerShell)

Install Python 3.11 or 3.12, Node.js 24+, and the [SpacetimeDB 2.x CLI](https://spacetimedb.com/docs/). Use a CLI/server compatible with the pinned `spacetimedb` 2.0.0 SDK.

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe download_model.py
Push-Location spacetimedb
npm.cmd ci
npm.cmd run check
npm.cmd test
Pop-Location
```

Start the database in its own terminal:

```powershell
spacetime start
```

In another terminal, from the repository root, publish the module and run the camera service:

```powershell
spacetime publish --server local --module-path spacetimedb poses
.\.venv\Scripts\python.exe cam.py
```

Open **http://127.0.0.1:8000** and click **Start new game**. The camera belongs to the computer running FastAPI, not the browser. Run a single server process without reload or multiple workers so it owns the webcam exclusively. API docs are at `/docs`.

## Playing

1. Player 1 stands in the left half of the unmirrored preview, Player 2 in the right. Keep full bodies visible and remain in your lanes. A center dead zone and ambiguous-lane rejection prevent uncertain observations from being scored. Additional detected people in a player's lane invalidate that lane until they leave.
2. Player 1 holds still for two seconds to save each of three poses. Move to a different pose between captures. Setting has no time limit.
3. A five-second get-ready countdown shows the first target without recording or using copying time. Then Player 2 copies the three poses **in order**, holding each for two seconds within the tolerance. The target skeleton and matrix appear beside the camera. Each target has a fresh 20-second deadline by default. Wrong poses can be retried until that deadline.
4. Copying all three swaps the setter role. Missing any deadline adds one letter to the copier, discards the sequence, and lets the same setter record three new poses.
5. The first player to accumulate **POSES** loses. Start a new game to play again; prior game rows remain stored in SpacetimeDB.

“Fails” means failing to copy the sequence before a deadline. A setter may take as long as needed. These rules apply symmetrically to both players.

## Matrices and tolerance

Each pose is a **24 × 3** matrix of xyz values from MediaPipe's estimated world landmarks. The first twelve rows are left/right shoulders, elbows, wrists, hips, knees, and ankles, in that order. Subtracting the midpoint of the hips centers the skeleton at the origin. Dividing by the shoulder-midpoint-to-hip-midpoint distance compensates for player size. The remaining twelve rows are directed limb vectors using `EDGES` in `pose_processing.py` (each endpoint is expressed in the same hip-centered coordinates).

SpacetimeDB compares matrices using root-mean-square Euclidean row distance. Default match tolerance is **0.25 torso lengths**; increase it in the UI to make copying easier. A stable hold must remain within 0.16 of its starting matrix for two seconds, with no observation gap over 600 ms. A setter must move at least 0.20 from the captured pose before recording again. Missing or low-confidence joints reset the hold. Left/right and body orientation are preserved; poses are not mirrored or rotationally aligned. The displayed target is the xy projection of the 3D matrix.

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

## Verification

```powershell
Push-Location spacetimedb
npm.cmd test
npm.cmd run check
Pop-Location
.\.venv\Scripts\python.exe -m pytest tests
```

Game tests cover ordered copying, role swaps, both players' penalties, five-letter elimination, uninterrupted holds, release requirements, tolerance, late observations, and malformed inputs. Python tests cover scale/translation normalization, unreliable joints, and lane assignment.

For a live smoke test, record three distinct poses, copy them to verify the role swap, then let a copying deadline expire to verify the letter penalty and unchanged setter. Cover a wrist during a hold to verify progress resets. Unplug the camera during copying to check that the deadline still expires.

Implementation references: [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/python), [SpacetimeDB reducers](https://spacetimedb.com/docs/functions/reducers/), and [publishing modules](https://spacetimedb.com/docs/databases/building-publishing/).
