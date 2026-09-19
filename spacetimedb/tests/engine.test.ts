import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, observe, tick, distance, validateMatrix, type Game } from '../src/engine.ts';
const pose = (n: number) => Array.from({length:24}, () => [n, 0, 0]);
function hold(g: Game, player: number, n: number, start: number) {
  for (let t = start; t <= start + 2000; t += 100) observe(g, player, pose(n), t);
}
function setThree(g: Game, start = 100) {
  for (let i=0;i<3;i++) hold(g, g.setter, i, start + i * 2200);
}
test('three poses, ordered copies, then swap roles', () => {
  const g=createGame(0);setThree(g);assert.equal(g.phase,'copying');
  hold(g,2,2,7000);assert.equal(g.index,0); // wrong order cannot advance
  for(let i=0;i<3;i++) hold(g,2,i,9300+i*2200);
  assert.equal(g.phase,'setting');assert.equal(g.setter,2);assert.equal(g.round,2);
  assert.deepEqual(g.letters,[0,0]);assert.equal(g.poses.length,0);
});
test('two seconds required; missing frames and movement reset hold', () => {
  const g=createGame(0);observe(g,1,pose(0),100);observe(g,1,pose(0),2100);
  assert.equal(g.poses.length,0);
  observe(g,1,null,2200);hold(g,1,0,2300);assert.equal(g.poses.length,1);
  hold(g,1,0,4500);assert.equal(g.poses.length,1); // must release
  observe(g,1,pose(1),6800);observe(g,1,pose(2),6900);
  assert.equal(g.holdMs,0);
});
test('timeout assigns exactly one letter and preserves setter; POSES loses', () => {
  const g=createGame(0);
  for(let n=0;n<5;n++) {
    setThree(g,n*100000+100);tick(g,g.deadline);
    assert.equal(g.letters[1],n+1);assert.equal(g.setter,1);
    tick(g,9999999);assert.equal(g.letters[1],n+1);
  }
  assert.equal(g.phase,'finished');assert.equal(g.winner,1);
});
test('player one can also earn letters after a role swap', () => {
  const g=createGame(0);setThree(g);
  for(let i=0;i<3;i++)hold(g,2,i,7000+i*2200);
  setThree(g,15000);tick(g,g.deadline);
  assert.deepEqual(g.letters,[1,0]);assert.equal(g.setter,2);
});
test('late frames do not record in the new round, inactive player is ignored', () => {
  const g=createGame(0);hold(g,2,0,100);assert.equal(g.poses.length,0);
  setThree(g,3000);observe(g,2,pose(0),g.deadline);
  assert.equal(g.phase,'setting');assert.equal(g.anchor,null);
});
test('tolerance accepts small errors and rejects large errors', () => {
  const g=createGame(0);setThree(g);hold(g,2,.3,7000);assert.equal(g.index,0);
  hold(g,2,.2,9300);assert.equal(g.index,1);
  assert.equal(distance(pose(0),pose(.25)),.25);
});
test('invalid matrices and settings rejected', () => {
  assert.throws(()=>validateMatrix([[1,2,3]]));
  assert.throws(()=>validateMatrix(pose(NaN)));
  assert.throws(()=>createGame(0,NaN));assert.throws(()=>createGame(0,.25,2));
});
