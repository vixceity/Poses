# Offline voiceover foundation

This directory is an isolated, dependency-free preview and playback layer for the
existing recordings in `assets/audio`. It is not imported by the local or online
game, and it does not observe game state.

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

## Event contract for later integration

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

`readysetgo` is disabled by default. No event above is connected to a game state
in this implementation.

## Playback behavior

`OfflineVoiceover` serializes all queued cues. A stitched prompt advances only
when the current `HTMLAudioElement` emits `ended`; recording durations are not
estimated with timers. An `error` event, a rejected `play()` call, or an invalid
path reports through `onError`, resolves that clip as an error, and continues to
the next queued clip.

Callers may supply a `dedupeKey` when enqueueing a cue. Reusing that key skips the
duplicate. Future game integration should derive unique keys from structured
state transitions rather than human-readable game messages.

## Automated tests

Node.js is already part of the project's documented setup. No package install is
needed:

```powershell
node --experimental-default-type=module --test tests/test_offline_voiceover.mjs
```

The tests validate the exact 22 paths, file existence, disabled ready-set-go
default, random selection, strict `ended`-event sequencing, composed prompt
order, deduplication, and queue recovery after playback errors.
