const PLAYER_ONE_ROOT = '../assets/audio/Female wanted lines (player 1)';
const PLAYER_TWO_ROOT = '../assets/audio/Male wanted lines (player 2)';

const freezePlayer = (player) => Object.freeze({
  ...player,
  praise: Object.freeze(player.praise),
});

export const RECORDINGS = Object.freeze({
  readySetGoEnabledByDefault: false,
  gameInstructions: Object.freeze([
    `${PLAYER_ONE_ROOT}/P1STARTGAMEINSTRUCTIONS.mp3`,
    `${PLAYER_TWO_ROOT}/P2STARTGAMEINSTRUCTIONS.mp3`,
  ]),
  players: Object.freeze({
    1: freezePlayer({
      name: `${PLAYER_ONE_ROOT}/playerone.mp3`,
      getReadyToPose: `${PLAYER_ONE_ROOT}/p1getreadytopose.mp3`,
      getReadyToCopy: `${PLAYER_ONE_ROOT}/p1getreadytocopy.mp3`,
      readySetGo: `${PLAYER_ONE_ROOT}/p1readysetgo.mp3`,
      praise: [
        `${PLAYER_ONE_ROOT}/p1amazing.mp3`,
        `${PLAYER_ONE_ROOT}/p1greatjob.mp3`,
        `${PLAYER_ONE_ROOT}/p1welldone.mp3`,
      ],
      pass: `${PLAYER_ONE_ROOT}/p1pass.mp3`,
      fail: `${PLAYER_ONE_ROOT}/p1fail.mp3`,
      win: `${PLAYER_ONE_ROOT}/p1win.mp3`,
    }),
    2: freezePlayer({
      name: `${PLAYER_TWO_ROOT}/playertwo.mp3`,
      getReadyToPose: `${PLAYER_TWO_ROOT}/p2getreadytopose.mp3`,
      getReadyToCopy: `${PLAYER_TWO_ROOT}/p2getreadytocopy.mp3`,
      readySetGo: `${PLAYER_TWO_ROOT}/p2readysetgo.mp3`,
      praise: [
        `${PLAYER_TWO_ROOT}/p2amazing.mp3`,
        `${PLAYER_TWO_ROOT}/p2greatjob.mp3`,
        `${PLAYER_TWO_ROOT}/p2welldone.mp3`,
      ],
      pass: `${PLAYER_TWO_ROOT}/p2pass.mp3`,
      fail: `${PLAYER_TWO_ROOT}/p2fail.mp3`,
      win: `${PLAYER_TWO_ROOT}/p2win.mp3`,
    }),
  }),
});

export function allRecordingPaths(recordings = RECORDINGS) {
  const paths = [...recordings.gameInstructions];
  for (const player of Object.values(recordings.players)) {
    paths.push(
      player.name,
      player.getReadyToPose,
      player.getReadyToCopy,
      player.readySetGo,
      ...player.praise,
      player.pass,
      player.fail,
      player.win,
    );
  }
  return paths;
}
