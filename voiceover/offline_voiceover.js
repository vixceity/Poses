import { RECORDINGS, allRecordingPaths } from './recordings.js';

const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACA';

export function chooseRandom(items, random = Math.random) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Cannot choose from an empty recording list.');
  }
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return items[Math.max(0, index)];
}

function defaultAudioFactory(url) {
  return new Audio(url);
}

export class OfflineVoiceover {
  constructor({
    recordings = RECORDINGS,
    baseUrl = import.meta.url,
    audioFactory = defaultAudioFactory,
    random = Math.random,
    onError = (_error) => {},
    readySetGo = recordings.readySetGoEnabledByDefault,
  } = {}) {
    this.recordings = recordings;
    this.baseUrl = baseUrl;
    this.audioFactory = audioFactory;
    this.random = random;
    this.onError = onError;
    this.readySetGoEnabled = Boolean(readySetGo);
    this.seen = new Set();
    this.groupVersions = new Map();
    this.queueTail = Promise.resolve();
    this.active = null;
  }

  resolvePath(path) {
    return new URL(path, this.baseUrl).href;
  }

  preload() {
    return allRecordingPaths(this.recordings).map((path) => {
      const audio = this.audioFactory(this.resolvePath(path));
      audio.preload = 'auto';
      if (typeof audio.load === 'function') audio.load();
      return audio;
    });
  }

  async unlock() {
    const audio = this.audioFactory(SILENT_WAV);
    audio.muted = true;
    try {
      await audio.play();
      if (typeof audio.pause === 'function') audio.pause();
      return true;
    } catch (cause) {
      this.reportError('Browser audio could not be enabled. Click a preview button and try again.', SILENT_WAV, cause);
      return false;
    }
  }

  setReadySetGoEnabled(enabled) {
    this.readySetGoEnabled = Boolean(enabled);
  }

  clearDedupe(dedupeKey) {
    if (dedupeKey === undefined) this.seen.clear();
    else this.seen.delete(dedupeKey);
  }

  cancelGroup(group) {
    this.groupVersions.set(group, (this.groupVersions.get(group) ?? 0) + 1);
  }

  enqueue(paths, { label = 'voiceover cue', dedupeKey, group } = {}) {
    const clips = Array.isArray(paths) ? [...paths] : [paths];
    const groupVersion = group === undefined ? null : (this.groupVersions.get(group) ?? 0);
    const canceled = () => group !== undefined && (this.groupVersions.get(group) ?? 0) !== groupVersion;
    if (dedupeKey !== undefined) {
      if (this.seen.has(dedupeKey)) {
        return Promise.resolve({ label, skipped: true, results: [] });
      }
      this.seen.add(dedupeKey);
    }

    const run = async () => {
      const results = [];
      for (const path of clips) {
        if (canceled()) {
          return { label, skipped: false, canceled: true, results };
        }
        if (typeof path !== 'string' || path.length === 0) {
          this.reportError(`Missing recording path in "${label}".`, String(path), null);
          results.push({ path, status: 'error' });
          continue;
        }
        results.push(await this.playOne(path, label));
      }
      return { label, skipped: false, canceled: false, results };
    };

    const queued = this.queueTail.then(run, run);
    this.queueTail = queued.catch((cause) => {
      this.reportError(`Unexpected voiceover queue failure in "${label}".`, '', cause);
    });
    return queued;
  }

  async playOne(path, label) {
    const url = this.resolvePath(path);
    let audio;
    try {
      audio = this.audioFactory(url);
    } catch (cause) {
      this.reportError(`Could not create audio for "${label}": ${path}`, path, cause);
      return { path, url, status: 'error' };
    }

    audio.preload = 'auto';
    return new Promise((resolve) => {
      let settled = false;
      const finish = (status, cause = null) => {
        if (settled) return;
        settled = true;
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        if (this.active?.audio === audio) this.active = null;
        if (status === 'error') {
          this.reportError(`Recording failed in "${label}": ${path}`, path, cause);
        }
        resolve({ path, url, status });
      };
      const onEnded = () => finish('ended');
      const onError = (event) => finish('error', event?.error ?? audio.error ?? event);

      audio.addEventListener('ended', onEnded, { once: true });
      audio.addEventListener('error', onError, { once: true });
      this.active = { audio, finish };

      try {
        const playResult = audio.play();
        if (playResult && typeof playResult.catch === 'function') {
          playResult.catch((cause) => finish('error', cause));
        }
      } catch (cause) {
        finish('error', cause);
      }
    });
  }

  stop() {
    if (!this.active) return;
    const { audio, finish } = this.active;
    if (typeof audio.pause === 'function') audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // Some media implementations do not allow seeking before metadata loads.
    }
    finish('stopped');
  }

  gameInstructions(options) {
    return this.enqueue(
      [chooseRandom(this.recordings.gameInstructions, this.random)],
      { label: 'game.instructions', ...options },
    );
  }

  preparePose(player, options) {
    const clips = this.player(player);
    return this.enqueue(
      [clips.name, clips.getReadyToPose],
      { label: `turn.pose.prepare(${player})`, ...options },
    );
  }

  prepareCopy(player, options) {
    const clips = this.player(player);
    return this.enqueue(
      [clips.name, clips.getReadyToCopy],
      { label: `turn.copy.prepare(${player})`, ...options },
    );
  }

  readySetGo(player, options) {
    if (!this.readySetGoEnabled) {
      return Promise.resolve({
        label: `turn.start.optional(${player})`,
        disabled: true,
        skipped: true,
        results: [],
      });
    }
    return this.enqueue(
      [this.player(player).readySetGo],
      { label: `turn.start.optional(${player})`, ...options },
    );
  }

  praise(player, options) {
    return this.enqueue(
      [chooseRandom(this.player(player).praise, this.random)],
      { label: `pose.completed(${player})`, ...options },
    );
  }

  poseRecorded(options) {
    return this.enqueue(
      [this.recordings.poseRecorded],
      { label: 'pose.recorded', ...options },
    );
  }

  pass(player, options) {
    return this.enqueue(
      [this.player(player).pass],
      { label: `turn.completed(${player})`, ...options },
    );
  }

  fail(player, options) {
    return this.enqueue(
      [this.player(player).fail],
      { label: `letter.awarded(${player})`, ...options },
    );
  }

  win(player, options) {
    return this.enqueue(
      [this.player(player).win],
      { label: `game.won(${player})`, ...options },
    );
  }

  player(player) {
    const clips = this.recordings.players[player];
    if (!clips) throw new Error(`Unknown player "${player}". Expected 1 or 2.`);
    return clips;
  }

  reportError(message, path, cause) {
    const error = {
      message,
      path,
      cause,
      detail: cause instanceof Error ? cause.message : String(cause ?? ''),
    };
    try {
      this.onError(error);
    } catch {
      // Error reporting must never block subsequent queued recordings.
    }
  }
}
