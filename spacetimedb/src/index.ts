import { schema, table, t } from 'spacetimedb/server';
import { createGame, observe, tick, type Game, type Matrix } from './engine';

const game = table({name:'game', public:true}, {
  id:t.string().primaryKey(), owner:t.identity(), state:t.string(),
});
const db = schema({game});
export default db;

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
