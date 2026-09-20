import { expect, test } from '@playwright/test'
import { EMPTY_STATE, type BackendGame, type BackendState } from '../components/game/game-state'

declare global {
  interface Window {
    __playedVoiceover: string[]
  }
}

const matrix = Array.from({ length: 24 }, () => [0, 0, 0])
const initial: BackendGame = {
  phase: 'setting', setter: 1, round: 1, letters: [0, 0], poses: [], index: 0,
  winner: 0, deadline: 20000, holdMs: 0, timeoutMs: 20000, tolerance: .25,
  error: null, message: 'structured state only',
}

test('structured game transitions emit each offline voiceover cue once', async ({ page }) => {
  await page.addInitScript(() => {
    window.__playedVoiceover = []
    class MockAudio {
      src: string
      muted = false
      preload = ''
      currentTime = 0
      error = null
      listeners: Record<string, (() => void)[]> = {}
      constructor(src: string) { this.src = src }
      addEventListener(type: string, listener: () => void) {
        this.listeners[type] = [...(this.listeners[type] ?? []), listener]
      }
      removeEventListener(type: string, listener: () => void) {
        this.listeners[type] = (this.listeners[type] ?? []).filter(item => item !== listener)
      }
      play() {
        if (!this.src.startsWith('data:')) {
          window.__playedVoiceover.push(decodeURI(this.src))
          queueMicrotask(() => this.listeners.ended?.forEach(listener => listener()))
        }
        return Promise.resolve()
      }
      pause() {}
      load() {}
    }
    Object.defineProperty(window, 'Audio', { configurable: true, value: MockAudio })
  })

  let state: BackendState = {
    ...EMPTY_STATE, status: 'Camera ready', camera_ready: true, visible_players: [1, 2],
  }
  await page.route('http://127.0.0.1:8000/**', route => {
    if (route.request().url().endsWith('/api/state')) return route.fulfill({ json: state })
    return route.fulfill({ status: 404 })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'ENABLE VOICEOVER' }).click()
  await expect(page.getByRole('button', { name: 'VOICEOVER ON' })).toBeDisabled()
  await expect.poll(() => page.evaluate(() => window.__playedVoiceover.length)).toBe(1)
  expect((await page.evaluate(() => window.__playedVoiceover)).at(-1))
    .toMatch(/P[12]STARTGAMEINSTRUCTIONS\.mp3$/)

  state = { ...state, id: 'voice-test', game: structuredClone(initial) }
  await expect.poll(() => page.evaluate(() => window.__playedVoiceover.length)).toBe(3)
  let played = await page.evaluate(() => window.__playedVoiceover)
  expect(played[0]).toMatch(/P[12]STARTGAMEINSTRUCTIONS\.mp3$/)
  expect(played.slice(1)).toEqual(expect.arrayContaining([
    expect.stringMatching(/playerone\.mp3$/),
    expect.stringMatching(/p1getreadytopose\.mp3$/),
  ]))

  const afterInitial = played.length
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => window.__playedVoiceover.length)).toBe(afterInitial)

  state.game = { ...initial, poses: [matrix] }
  await expect.poll(() => page.evaluate(() => window.__playedVoiceover.length)).toBe(afterInitial + 1)
  played = await page.evaluate(() => window.__playedVoiceover)
  expect(played.at(-1)).toMatch(/ding\.mp3$/)

  const beforeReady = played.length
  state.game = { ...initial, phase: 'ready', poses: [matrix, matrix, matrix], deadline: 3000 }
  await expect.poll(() => page.evaluate(() => window.__playedVoiceover.length)).toBe(beforeReady + 4)
  played = await page.evaluate(() => window.__playedVoiceover)
  expect(played.slice(-4)).toEqual([
    expect.stringMatching(/ding\.mp3$/),
    expect.stringMatching(/ding\.mp3$/),
    expect.stringMatching(/playertwo\.mp3$/),
    expect.stringMatching(/p2getreadytocopy\.mp3$/),
  ])

  state.game = { ...state.game, phase: 'copying', index: 0, deadline: 20000 }
  await page.waitForTimeout(300)
  state.game = { ...state.game, index: 1 }
  const beforeCopy = played.length
  await expect.poll(() => page.evaluate(() => window.__playedVoiceover.length)).toBe(beforeCopy + 1)
  expect((await page.evaluate(() => window.__playedVoiceover)).at(-1))
    .toMatch(/p2(amazing|greatjob|welldone)\.mp3$/)

  state.game = { ...initial, round: 2, letters: [0, 1] }
  const beforeFail = await page.evaluate(() => window.__playedVoiceover.length)
  await expect.poll(() => page.evaluate(() => window.__playedVoiceover.length)).toBe(beforeFail + 3)
  played = await page.evaluate(() => window.__playedVoiceover)
  expect(played.slice(-3)).toEqual([
    expect.stringMatching(/p2fail\.mp3$/),
    expect.stringMatching(/playerone\.mp3$/),
    expect.stringMatching(/p1getreadytopose\.mp3$/),
  ])

  state.game = { ...initial, phase: 'finished', round: 2, letters: [0, 5], winner: 1 }
  const beforeWin = played.length
  await expect.poll(() => page.evaluate(() => window.__playedVoiceover.length)).toBe(beforeWin + 2)
  played = await page.evaluate(() => window.__playedVoiceover)
  expect(played.slice(-2)).toEqual([
    expect.stringMatching(/p2fail\.mp3$/),
    expect.stringMatching(/p1win\.mp3$/),
  ])
  expect(played.some(url => /pass\.mp3$/.test(url))).toBe(false)
  expect(played.some(url => /readysetgo\.mp3$/.test(url))).toBe(false)
})
