# Offline voiceover foundation

This directory contains the dependency-free preview and playback layer for the
existing recordings in `assets/audio`. The Next.js local game uses it through
the FastAPI host's `/voiceover` and `/assets/audio` routes. Online play remains
unconnected.

## Preview

From the repository root, run:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Then open:

<http://127.0.0.1:8765/voiceover/preview.html>

Use **Enable audio** if the browser blocks playback. The preview can play every
recording, composed player prompts, randomized praise, and an intentional
missing-file recovery check. Errors remain visible on the page.

The server must be started from the repository root so the unchanged recordings
remain available under `/assets/audio/`. The manifest keeps their exact spaces,
capitalization, and parentheses. `new URL(path, baseUrl)` performs URL encoding;
the files themselves are never renamed or copied.

## Local-game event contract

- `game.instructions`: randomly select one start-instruction recording.
- `turn.pose.prepare(player)`: play the player's name, wait for `ended`, then
  play that player's get-ready-to-pose recording.
- `turn.copy.prepare(player)`: play the player's name, wait for `ended`, then
  play that player's get-ready-to-copy recording.
- `turn.start.optional(player)`: play ready-set-go only when explicitly enabled.
- `pose.completed(player)`: randomly select amazing, great job, or well done.
- `turn.completed(player)`: play pass after all three poses are completed.
- `letter.awarded(player)`: play fail when that player's letter count increases.
- `game.won(player)`: play win for the winner.

`readysetgo` is disabled by default. The local React game derives these cues from
changes to game ID, phase, round, setter, pose count/index, letters, and winner;
it never parses the displayed status message.

## Playback behavior

`OfflineVoiceover` serializes all queued cues. A stitched prompt advances only
when the current `HTMLAudioElement` emits `ended`; recording durations are not
estimated with timers. An `error` event, a rejected `play()` call, or an invalid
path reports through `onError`, resolves that clip as an error, and continues to
the next queued clip.

Callers may supply a `dedupeKey` when enqueueing a cue. Reusing that key skips the
duplicate. Cues may also use a cancellation `group`; the local game cancels
obsolete queued preparation prompts whenever structured game state advances.

## Automated tests

Node.js is already part of the project's documented setup. No package install is
needed:

```powershell
node --experimental-default-type=module --test tests/test_offline_voiceover.mjs
```

The tests validate the exact 22 paths, file existence, disabled ready-set-go
default, random selection, strict `ended`-event sequencing, composed prompt
order, deduplication, and queue recovery after playback errors.
