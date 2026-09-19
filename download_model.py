"""Download the official MediaPipe Full pose model (one-time setup)."""
from pathlib import Path
import urllib.request

if __name__ == '__main__':
    target = Path(__file__).resolve().parent / 'models/pose_landmarker_full.task'
    target.parent.mkdir(exist_ok=True)
    if target.exists():
        print(f'Already downloaded: {target}')
    else:
        url = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'
        temporary = target.with_suffix('.download')
        urllib.request.urlretrieve(url, temporary)
        temporary.replace(target)
        print(f'Downloaded: {target}')
