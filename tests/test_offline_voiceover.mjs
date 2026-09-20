import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { OfflineVoiceover, chooseRandom } from '../voiceover/offline_voiceover.js';
import { RECORDINGS, allRecordingPaths } from '../voiceover/recordings.js';

const recordingModuleUrl = new URL('../voiceover/recordings.js', import.meta.url);

const EXPECTED_PATHS = [
  '../assets/audio/ding.mp3',
  '../assets/audio/Female wanted lines (player 1)/P1STARTGAMEINSTRUCTIONS.mp3',
  '../assets/audio/Female wanted lines (player 1)/playerone.mp3',
  '../assets/audio/Female wanted lines (player 1)/p1getreadytopose.mp3',
  '../assets/audio/Female wanted lines (player 1)/p1getreadytocopy.mp3',
  '../assets/audio/Female wanted lines (player 1)/p1readysetgo.mp3',
  '../assets/audio/Female wanted lines (player 1)/p1amazing.mp3',
  '../assets/audio/Female wanted lines (player 1)/p1greatjob.mp3',
  '../assets/audio/Female wanted lines (player 1)/p1welldone.mp3',
  '../assets/audio/Female wanted lines (player 1)/p1pass.mp3',
  '../assets/audio/Female wanted lines (player 1)/p1fail.mp3',
  '../assets/audio/Female wanted lines (player 1)/p1win.mp3',
  '../assets/audio/Male wanted lines (player 2)/P2STARTGAMEINSTRUCTIONS.mp3',
  '../assets/audio/Male wanted lines (player 2)/playertwo.mp3',
  '../assets/audio/Male wanted lines (player 2)/p2getreadytopose.mp3',
  '../assets/audio/Male wanted lines (player 2)/p2getreadytocopy.mp3',
  '../assets/audio/Male wanted lines (player 2)/p2readysetgo.mp3',
  '../assets/audio/Male wanted lines (player 2)/p2amazing.mp3',
  '../assets/audio/Male wanted lines (player 2)/p2greatjob.mp3',
  '../assets/audio/Male wanted lines (player 2)/p2welldone.mp3',
  '../assets/audio/Male wanted lines (player 2)/p2pass.mp3',
  '../assets/audio/Male wanted lines (player 2)/p2fail.mp3',
  '../assets/audio/Male wanted lines (player 2)/p2win.mp3',
];

class MockAudio {
  constructor(url, log) {
    this.url = url;
    this.log = log;
    this.listeners = new Map();
    this.error = null;
    this.preload = '';
    this.currentTime = 0;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener));
  }

  play() {
    this.log.push(this.url);
    return Promise.resolve();
  }

  pause() {}
  load() {}

  emit(type, event = {}) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

function harness(options = {}) {
  const instances = [];
  const plays = [];
  const errors = [];
  const voiceover = new OfflineVoiceover({
    audioFactory(url) {
      const audio = new MockAudio(url, plays);
      instances.push(audio);
      return audio;
    },
    onError(error) {
      errors.push(error);
    },
    ...options,
  });
  return { voiceover, instances, plays, errors };
}

async function nextMicrotask() {
  await Promise.resolve();
  await Promise.resolve();
}

test('manifest contains the exact 23 existing audio paths', () => {
  const actual = allRecordingPaths();
  assert.equal(actual.length, 23);
  assert.equal(new Set(actual).size, 23);
  assert.deepEqual([...actual].sort(), [...EXPECTED_PATHS].sort());
  for (const path of actual) {
    assert.equal(existsSync(fileURLToPath(new URL(path, recordingModuleUrl))), true, `Missing: ${path}`);
  }
});

test('recordings are loadable MP3 files on the FastAPI audio route', () => {
  const voiceover = new OfflineVoiceover({
    baseUrl: 'http://127.0.0.1:8000/voiceover/offline_voiceover.js',
  });

  for (const path of allRecordingPaths()) {
    const url = new URL(voiceover.resolvePath(path));
    assert.equal(url.origin, 'http://127.0.0.1:8000');
    assert.equal(url.pathname.startsWith('/assets/audio/'), true, `Unexpected route for ${path}`);
    assert.equal(url.pathname.endsWith('.mp3'), true, `Unexpected extension for ${path}`);

    const bytes = readFileSync(fileURLToPath(new URL(path, recordingModuleUrl)));
    assert.equal(bytes.length > 1024, true, `Recording is unexpectedly small: ${path}`);
    const hasId3Header = bytes.subarray(0, 3).toString('ascii') === 'ID3';
    const hasMp3FrameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    assert.equal(hasId3Header || hasMp3FrameSync, true, `Recording is not an MP3 asset: ${path}`);
  }
});

test('ready-set-go is disabled by default', async () => {
  assert.equal(RECORDINGS.readySetGoEnabledByDefault, false);
  const { voiceover, instances } = harness();
  const result = await voiceover.readySetGo(1);
  assert.equal(result.disabled, true);
  assert.equal(instances.length, 0);
});

test('random selection honors both ends of each praise pool', () => {
  const praise = RECORDINGS.players[1].praise;
  assert.equal(chooseRandom(praise, () => 0), praise[0]);
  assert.equal(chooseRandom(praise, () => 0.999999), praise.at(-1));
});

test('stitched clips advance only after each ended event', async () => {
  const { voiceover, instances, plays } = harness();
  const completed = voiceover.enqueue(['first.mp3', 'second.mp3'], { label: 'sequence' });
  await nextMicrotask();

  assert.equal(plays.length, 1);
  assert.match(plays[0], /first\.mp3$/);

  instances[0].emit('ended');
  await nextMicrotask();
  assert.equal(plays.length, 2);
  assert.match(plays[1], /second\.mp3$/);

  instances[1].emit('ended');
  const result = await completed;
  assert.deepEqual(result.results.map((item) => item.status), ['ended', 'ended']);
});

test('composed player prompt preserves name then action order', async () => {
  const { voiceover, instances, plays } = harness();
  const completed = voiceover.preparePose(2);
  await nextMicrotask();
  assert.match(decodeURI(plays[0]), /Male wanted lines \(player 2\)\/playertwo\.mp3$/);

  instances[0].emit('ended');
  await nextMicrotask();
  assert.match(decodeURI(plays[1]), /Male wanted lines \(player 2\)\/p2getreadytopose\.mp3$/);

  instances[1].emit('ended');
  await completed;
});

test('failed recording reports an error and does not block the queue', async () => {
  const { voiceover, instances, plays, errors } = harness();
  const completed = voiceover.enqueue(['missing.mp3', 'recovery.mp3'], { label: 'recovery' });
  await nextMicrotask();

  instances[0].emit('error', { error: new Error('404 Not Found') });
  await nextMicrotask();
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /missing\.mp3/);
  assert.equal(plays.length, 2);
  assert.match(plays[1], /recovery\.mp3$/);

  instances[1].emit('ended');
  const result = await completed;
  assert.deepEqual(result.results.map((item) => item.status), ['error', 'ended']);
});

test('duplicate dedupe keys are skipped without disturbing active playback', async () => {
  const { voiceover, instances, plays } = harness();
  const first = voiceover.enqueue(['once.mp3'], { dedupeKey: 'round:1:pose:1' });
  const duplicate = await voiceover.enqueue(['once.mp3'], { dedupeKey: 'round:1:pose:1' });
  await nextMicrotask();

  assert.equal(duplicate.skipped, true);
  assert.equal(plays.length, 1);
  instances[0].emit('ended');
  await first;
});

test('canceling a group drops obsolete queued and remaining stitched clips', async () => {
  const { voiceover, instances, plays } = harness();
  const blocker = voiceover.enqueue(['blocker.mp3']);
  const obsolete = voiceover.enqueue(
    ['player.mp3', 'get-ready.mp3'],
    { group: 'preparation' },
  );
  await nextMicrotask();
  voiceover.cancelGroup('preparation');
  instances[0].emit('ended');
  await blocker;
  const canceled = await obsolete;
  assert.equal(canceled.canceled, true);
  assert.equal(plays.length, 1);

  const partial = voiceover.enqueue(
    ['player.mp3', 'get-ready.mp3'],
    { group: 'preparation' },
  );
  await nextMicrotask();
  assert.match(plays[1], /player\.mp3$/);
  voiceover.cancelGroup('preparation');
  instances[1].emit('ended');
  const interrupted = await partial;
  assert.equal(interrupted.canceled, true);
  assert.equal(plays.length, 2);
});

test('controller uses ended events rather than duration timers', () => {
  const source = readFileSync(fileURLToPath(new URL('../voiceover/offline_voiceover.js', import.meta.url)), 'utf8');
  assert.match(source, /addEventListener\('ended'/);
  assert.doesNotMatch(source, /\bsetTimeout\b|\bsetInterval\b/);
});
