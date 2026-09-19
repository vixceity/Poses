import { schema, table, t } from 'spacetimedb/server';
import { createGame, observe, tick, type Game, type Matrix } from './engine';

const game = table({name:'game', public:true}, {
  id:t.string().primaryKey(), owner:t.identity(), state:t.string(),
});
const lobby = table({name:'lobby', public:true}, {
  code:t.string().primaryKey(), host:t.identity(), status:t.string(), game_id:t.string(),
});
const lobby_player = table({name:'lobby_player', public:true}, {
  id:t.string().primaryKey(), lobby:t.string(), player:t.u8(), identity:t.identity(), ready:t.bool(),
});
const db = schema({game, lobby, lobby_player});
export default db;

function validLobbyCode(code: string) {
  if (!/^[A-Z0-9]{4,8}$/.test(code)) throw new Error('Invalid lobby code');
}

function requireLobbyPlayer(ctx: any, code: string, player: number) {
  validLobbyCode(code);
  if (player !== 1 && player !== 2) throw new Error('Invalid player');
  const member = ctx.db.lobby_player.id.find(`${code}:${player}`);
  if (!member || !member.identity.isEqual(ctx.sender)) throw new Error('Not assigned to this player slot');
  return member;
}

export const online_create_lobby = db.reducer({code:t.string()}, (ctx, {code}) => {
  validLobbyCode(code);
  if (ctx.db.lobby.code.find(code)) throw new Error('Lobby already exists');
  ctx.db.lobby.insert({code, host:ctx.sender, status:'waiting', game_id:''});
  ctx.db.lobby_player.insert({id:`${code}:1`, lobby:code, player:1, identity:ctx.sender, ready:false});
});

export const online_join_lobby = db.reducer({code:t.string()}, (ctx, {code}) => {
  validLobbyCode(code);
  const row = ctx.db.lobby.code.find(code);
  if (!row || row.status !== 'waiting') throw new Error('Lobby is unavailable');
  if (ctx.db.lobby_player.id.find(`${code}:2`)) throw new Error('Lobby is full');
  ctx.db.lobby_player.insert({id:`${code}:2`, lobby:code, player:2, identity:ctx.sender, ready:false});
  ctx.db.lobby.code.update({...row, status:'ready'});
});

export const online_set_ready = db.reducer({code:t.string(), player:t.u8(), ready:t.bool()},
  (ctx, {code, player, ready}) => {
    const member = requireLobbyPlayer(ctx, code, player);
    ctx.db.lobby_player.id.update({...member, ready});
  });

export const online_start_game = db.reducer({code:t.string(), tolerance:t.f64(), timeout_seconds:t.u32()},
  (ctx, {code, tolerance, timeout_seconds}) => {
    const lobbyRow = ctx.db.lobby.code.find(code);
    if (!lobbyRow || !lobbyRow.host.isEqual(ctx.sender)) throw new Error('Only the lobby host can start');
    const first = ctx.db.lobby_player.id.find(`${code}:1`);
    const second = ctx.db.lobby_player.id.find(`${code}:2`);
    if (!first?.ready || !second?.ready) throw new Error('Both players must be ready');
    if (lobbyRow.game_id) throw new Error('Game already started');
    const state = createGame(Number(ctx.timestamp.microsSinceUnixEpoch / 1000n), tolerance, timeout_seconds);
    ctx.db.game.insert({id:code, owner:ctx.sender, state:JSON.stringify(state)});
    ctx.db.lobby.code.update({...lobbyRow, status:'playing', game_id:code});
  });

export const online_submit_frame = db.reducer({code:t.string(), player:t.u8(), matrix_json:t.string()},
  (ctx, {code, player, matrix_json}) => {
    requireLobbyPlayer(ctx, code, player);
    if (matrix_json.length > 16000) throw new Error('Matrix too large');
    const lobbyRow = ctx.db.lobby.code.find(code);
    const row = lobbyRow?.game_id ? ctx.db.game.id.find(lobbyRow.game_id) : undefined;
    if (!row) throw new Error('Game has not started');
    const state: Game = JSON.parse(row.state);
    const matrix: Matrix | null = JSON.parse(matrix_json);
    observe(state, player, matrix, Number(ctx.timestamp.microsSinceUnixEpoch / 1000n));
    ctx.db.game.id.update({...row, state:JSON.stringify(state)});
  });

export const online_heartbeat = db.reducer({code:t.string(), player:t.u8()}, (ctx, {code, player}) => {
  requireLobbyPlayer(ctx, code, player);
  const lobbyRow = ctx.db.lobby.code.find(code);
  const row = lobbyRow?.game_id ? ctx.db.game.id.find(lobbyRow.game_id) : undefined;
  if (!row) throw new Error('Game has not started');
  const state: Game = JSON.parse(row.state);
  if (tick(state, Number(ctx.timestamp.microsSinceUnixEpoch / 1000n)))
    ctx.db.game.id.update({...row, state:JSON.stringify(state)});
});

export const create_game = db.reducer({id:t.string(), tolerance:t.f64(), timeout_seconds:t.u32()},
  (ctx, {id, tolerance, timeout_seconds}) => {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('Invalid game ID');
    if (ctx.db.game.id.find(id)) throw new Error('Game already exists; choose a new ID');
    const state = createGame(Number(ctx.timestamp.microsSinceUnixEpoch / 1000n), tolerance, timeout_seconds);
    ctx.db.game.insert({id, owner:ctx.sender, state:JSON.stringify(state)});
  });

export const submit_frame = db.reducer({id:t.string(), player:t.u8(), matrix_json:t.string()},
  (ctx, {id, player, matrix_json}) => {
    const row = ctx.db.game.id.find(id);
    if (!row || !row.owner.isEqual(ctx.sender)) throw new Error('Only the camera host may submit observations');
    if (player !== 1 && player !== 2) throw new Error('Invalid player');
    if (matrix_json.length > 16000) throw new Error('Matrix too large');
    const state: Game = JSON.parse(row.state);
    const matrix: Matrix | null = JSON.parse(matrix_json);
    observe(state, player, matrix, Number(ctx.timestamp.microsSinceUnixEpoch / 1000n));
    ctx.db.game.id.update({...row, state:JSON.stringify(state)});
  });

// The FastAPI host sends heartbeats even when the camera cannot see a player.
// Deadlines use database time and are also checked by every observation.
export const heartbeat = db.reducer({id:t.string()}, (ctx, {id}) => {
  const row = ctx.db.game.id.find(id);
  if (!row || !row.owner.isEqual(ctx.sender)) throw new Error('Only the camera host may tick this game');
  const state: Game = JSON.parse(row.state);
  if (tick(state, Number(ctx.timestamp.microsSinceUnixEpoch / 1000n)))
    ctx.db.game.id.update({...row, state:JSON.stringify(state)});
});
