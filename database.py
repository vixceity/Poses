"""Small HTTP bridge; all game decisions run inside SpacetimeDB."""
import json
import os
from pathlib import Path
from urllib.parse import quote
import httpx


class Database:
    def __init__(self):
        self.base = os.getenv('SPACETIMEDB_URL', 'http://127.0.0.1:3000').rstrip('/')
        self.name = os.getenv('SPACETIMEDB_DATABASE', 'poses')
        self.client = httpx.Client(timeout=3)
        self.token_path = Path(__file__).parent / '.spacetime-token'

    def connect(self):
        token = os.getenv('SPACETIMEDB_TOKEN')
        if not token and self.token_path.exists():
            token = self.token_path.read_text().strip()
        if not token:
            response = self.client.post(f'{self.base}/v1/identity')
            response.raise_for_status()
            token = response.json()['token']
            self.token_path.write_text(token)
        self.client.headers['Authorization'] = f'Bearer {token}'

    def call(self, reducer, *args):
        response = self.client.post(
            f'{self.base}/v1/database/{quote(self.name, safe="")}/call/{reducer}', json=list(args))
        response.raise_for_status()

    def state(self, game_id):
        # IDs are generated server-side UUID hex strings, never raw SQL from clients.
        if not game_id.isalnum() or len(game_id) > 64:
            raise ValueError('Invalid game ID')
        response = self.client.post(
            f'{self.base}/v1/database/{quote(self.name, safe="")}/sql',
            content=f"SELECT state FROM game WHERE id = '{game_id}'",
            headers={'Content-Type': 'text/plain'})
        response.raise_for_status()
        rows = response.json()[0]['rows']
        if not rows:
            raise RuntimeError('Game was not found in SpacetimeDB')
        return json.loads(rows[0][0])
