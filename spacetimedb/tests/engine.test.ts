import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, observe, tick, distance, validateMatrix, type Game } from '../src/engine.ts';
const pose = (n: number) => Array.from({length:24}, () => [n, 0, 0]);
test('handoff ignores valid frames from both players', () => {
  const g=createGame(0);
  tick(g,g.deadline);
  const expected=structuredClone(g);
  observe(g,1,pose(0),20500);observe(g,2,pose(1),20600);
  assert.deepEqual(g,expected);
});
test('both players can lose at exactly five failed sequences', () => {
  for (const setter of [1,2]) {
    const g=createGame(0);g.setter=setter;
    let start=100;
    for(let miss=1;miss<=5;miss++) {
      setThree(g,start);const deadline=g.deadline;tick(g,deadline);
      assert.equal(g.letters[2-setter],miss);
      assert.equal(g.letters[setter-1],0);
      assert.equal(g.phase,miss===5?'finished':'setting');
      start=deadline+100;
    }
    assert.equal(g.winner,setter);
    tick(g,g.deadline+100000);assert.equal(g.letters[2-setter],5);
  }
});
test('handoff provides three seconds without recording or spending copying time', () => {
  const g=createGame(0);
  for(let i=0;i<3;i++) hold(g,1,i,100+i*2200);
  assert.equal(g.phase,'ready');assert.equal(g.deadline,9500);
  hold(g,2,0,7000);
  assert.equal(g.index,0);assert.equal(g.holdMs,0);
  assert.equal(tick(g,9499),false);
  tick(g,9500);
  assert.equal(g.phase,'copying');assert.equal(g.deadline,29500);
  assert.deepEqual(g.letters,[0,0]);
  hold(g,2,0,11600);assert.equal(g.index,1);
});
function hold(g: Game, player: number, n: number, start: number) {
  for (let t = start; t <= start + 2000; t += 100) observe(g, player, pose(n), t);
}
function setThree(g: Game, start = 100) {
  for (let i=0;i<3;i++) hold(g, g.setter, i, start + i * 2200);
  tick(g, g.deadline);
}
test('three poses, ordered copies, then swap roles', () => {
  const g=createGame(0);setThree(g);assert.equal(g.phase,'copying');
  hold(g,2,2,12000);assert.equal(g.index,0); // wrong order cannot advance
  for(let i=0;i<3;i++) hold(g,2,i,14300+i*2200);
  assert.equal(g.phase,'handoff');assert.equal(g.setter,2);assert.equal(g.round,2);
  assert.equal(g.timeoutMs,19500);
  tick(g,g.deadline);assert.equal(g.phase,'setting');
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
test('movement at the end of a setter hold restarts the full hold', () => {
  const g=createGame(0);
  for(let t=100;t<=2000;t+=100) observe(g,1,pose(0),t);
  observe(g,1,pose(.2),2100);
  assert.equal(g.poses.length,0);assert.equal(g.holdMs,0);
  for(let t=2200;t<=4000;t+=100) observe(g,1,pose(.2),t);
  assert.equal(g.poses.length,0);
  observe(g,1,pose(.2),4100);assert.equal(g.poses.length,1);
  assert.deepEqual(g.poses[0],pose(.2));
});
test('timeout assigns exactly one letter and preserves setter; POSES loses', () => {
  const g=createGame(0);
  setThree(g);tick(g,g.deadline);
  assert.deepEqual(g.letters,[0,1]);assert.equal(g.setter,1);
  assert.equal(g.timeoutMs,20000);
});
test('copy timeout decreases by half a second but never below twelve seconds', () => {
  const g=createGame(0, .25, 12.25);
  setThree(g);
  for (let i = 0; i < 3; i++) hold(g, 2, i, 12000 + i * 2200);
  assert.equal(g.timeoutMs, 12000);
  assert.equal(g.letters[1], 0);
});
test('setter timeout hands the turn to the other player', () => {
  const g=createGame(0);
  tick(g,g.deadline);assert.equal(g.phase,'handoff');assert.equal(g.setter,2);
  tick(g,g.deadline);assert.equal(g.phase,'setting');assert.equal(g.deadline,43000);
});
test('setter has one total twenty-second window for all three poses', () => {
  const g=createGame(0);
  hold(g,1,0,100);assert.equal(g.poses.length,1);
  observe(g,1,null,19900);hold(g,1,1,20000);
  assert.equal(g.phase,'handoff');assert.equal(g.setter,2);
});
test('late frames do not record in the new round, inactive player is ignored', () => {
  const g=createGame(0);hold(g,2,0,100);assert.equal(g.poses.length,0);
  setThree(g,3000);observe(g,2,pose(0),g.deadline);
  assert.equal(g.phase,'setting');assert.equal(g.anchor,null);
});
test('tolerance accepts small errors and rejects large errors', () => {
  const g=createGame(0,.25);setThree(g);hold(g,2,.3,12000);assert.equal(g.index,0);
  hold(g,2,.2,14300);assert.equal(g.index,1);
  assert.equal(distance(pose(0),pose(.25)),.25);
});
test('invalid matrices and settings rejected', () => {
  assert.throws(()=>validateMatrix([[1,2,3]]));
  assert.throws(()=>validateMatrix(pose(NaN)));
  assert.throws(()=>createGame(0,NaN));assert.throws(()=>createGame(0,.25,2));
});
