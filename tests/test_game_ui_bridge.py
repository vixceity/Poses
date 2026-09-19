from copy import deepcopy
from unittest.mock import Mock

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

import cam


@pytest.fixture
def host(monkeypatch):
    instance = cam.CameraHost()
    instance.db.client.close()
    instance.db = Mock()
    instance.game_id = 'testgame'
    frame = np.zeros((200, 400, 3), dtype=np.uint8)
    frame[:, :200] = (0, 0, 255)
    frame[:, 200:] = (255, 0, 0)
    instance.jpeg = cv2.imencode('.jpg', frame)[1].tobytes()
    monkeypatch.setattr(cam, 'host', instance)
    return instance


@pytest.mark.parametrize('setter', [1, 2])
def test_third_saved_pose_captures_correct_mirrored_lane(host, setter):
    before = {'phase': 'setting', 'round': 1, 'setter': setter, 'poses': [[], []]}
    after = {**before, 'phase': 'ready', 'poses': [[], [], []]}
    host.capture_saved_pose(before, after)
    photo = cv2.imdecode(np.frombuffer(host.pose_photos[(1, 2)], np.uint8), cv2.IMREAD_COLOR)
    channel = 2 if setter == 1 else 0
    assert photo[100, 100, channel] > 240
    client = TestClient(cam.app)
    state = client.get('/api/state').json()
    assert state['camera_ready']
    url = state['pose_photos'][0]['url']
    assert client.get(url).status_code == 200
    host.game_id = 'newgame'
    assert client.get(url).status_code == 404


def test_handoff_does_not_submit_camera_observations(host):
    host.db.state.return_value = {'phase': 'handoff'}
    host.send_observation({1: [], 2: []})
    host.db.call.assert_called_once_with('heartbeat', 'testgame')


def test_round_change_cannot_capture_old_pose(host):
    before = {'phase': 'setting', 'round': 1, 'setter': 1, 'poses': []}
    host.capture_saved_pose(before, {**before, 'round': 2, 'poses': [[]]})
    assert host.pose_photos == {}


def test_new_game_clears_replay_and_gesture(host):
    host.pose_photos[(1, 0)] = b'old'
    host.ready_hold_ms = 2000
    host.ready_players = [1, 2]
    host.ready_latched = True
    host.start_game(.25, 20)
    assert not host.pose_photos
    assert host.ready_hold_ms == 0
    assert host.ready_players == []
    assert not host.ready_armed
    assert not host.ready_latched


def test_new_game_requires_fresh_two_player_hand_hold(host):
    with pytest.raises(ValueError, match='Both players'):
        host.start_game(.25, 20)


def test_reset_returns_to_waiting_and_requires_release(host):
    host.state = {'phase': 'setting'}
    host.pose_photos[(1, 0)] = b'old'
    host.ready_players = [1, 2]
    host.ready_hold_ms = 2000
    host.reset_game()
    assert host.game_id is None
    assert host.state is None
    assert host.pose_photos == {}
    assert not host.ready_armed

    host.ready_players = [1, 2]
    host.ready_hold_ms = 2000
    host.ready_armed = False
    with pytest.raises(ValueError, match='Both players'):
        host.start_game(.25, 20)


def test_two_players_must_hold_hands_up_continuously(host):
    from types import SimpleNamespace
    points = [SimpleNamespace(x=.2, y=.5) for _ in range(33)]
    points[15].y = .1
    players = [deepcopy(points), deepcopy(points)]
    lanes = {1: 0, 2: 1}
    host.update_ready_gesture(players, lanes, 100)
    host.update_ready_gesture(players, lanes, 2100)
    assert host.ready_hold_ms == 2000
    players[1][15].y = .8
    host.update_ready_gesture(players, lanes, 2200)
    assert host.ready_hold_ms == 0


def test_completed_hand_hold_remains_valid_after_hands_lower(host):
    from types import SimpleNamespace
    points = [SimpleNamespace(x=.2, y=.5) for _ in range(33)]
    points[15].y = .1
    players = [deepcopy(points), deepcopy(points)]
    lanes = {1: 0, 2: 1}
    host.update_ready_gesture(players, lanes, 100)
    host.update_ready_gesture(players, lanes, 2100)
    assert host.ready_latched

    players[0][15].y = .8
    players[1][15].y = .8
    host.update_ready_gesture(players, lanes, 2200)
    host.start_game(.25, 20)

    host.db.call.assert_called_once_with('create_game', host.game_id, .25, 20)
