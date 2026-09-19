import pytest
from fastapi.testclient import TestClient

import cam_multiplayer


@pytest.fixture
def client():
    return TestClient(cam_multiplayer.app)


def test_create_room_and_relay_offer_between_players(client):
    response = client.post('/api/rooms')
    assert response.status_code == 200
    room = response.json()['room']

    def next_message(ws, *expected_types):
        while True:
            message = ws.receive_json()
            if message.get('type') in expected_types:
                return message

    with client.websocket_connect(f'/ws/{room}/1') as ws1, client.websocket_connect(f'/ws/{room}/2') as ws2:
        first = next_message(ws1, 'state')
        second = next_message(ws2, 'state')
        assert first['type'] == 'state'
        assert second['type'] == 'state'

        ws1.send_json({'type': 'offer', 'sdp': 'offer-sdp'})
        payload = next_message(ws2, 'offer')
        assert payload['type'] == 'offer'
        assert payload['player'] == '1'
        assert payload['sdp'] == 'offer-sdp'

        ws2.send_json({'type': 'candidate', 'candidate': {'sdpMid': '0', 'candidate': 'abc'}})
        payload = next_message(ws1, 'candidate')
        assert payload['type'] == 'candidate'
        assert payload['player'] == '2'
        assert payload['candidate']['candidate'] == 'abc'
