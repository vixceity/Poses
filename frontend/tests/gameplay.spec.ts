import { test, expect } from '@playwright/test'
import { EMPTY_STATE, type BackendState, type BackendGame } from '../components/game/game-state'

const joints = [[-.5,-1,0],[.5,-1,0],[-1,-.6,0],[1,-.6,0],[-1.3,-1.5,0],[1.3,-1.5,0],[-.3,0,0],[.3,0,0],[-.3,1,0],[.3,1,0],[-.3,2,0],[.3,2,0]]
const matrix = [...joints, ...joints]
const initial: BackendGame = { phase:'setting',setter:1,round:1,letters:[0,0],poses:[],index:0,winner:0,deadline:20000,holdMs:0,timeoutMs:20000,tolerance:.25,error:null,message:'Player 1: hold steady' }

test('hand start, all phases, reset, photos, penalties, replay and mobile layout', async ({ page }) => {
  let state: BackendState = { ...EMPTY_STATE, status:'Camera ready', camera_ready:true, visible_players:[1,2] }
  let starts=0
  await page.route('http://127.0.0.1:8000/**', async route => {
    const url=route.request().url()
    if(url.endsWith('/api/state')) return route.fulfill({json:state})
    if(url.endsWith('/api/games/reset')) {
      state={...EMPTY_STATE,status:'Camera ready',camera_ready:true,visible_players:[1,2]}
      return route.fulfill({json:{ok:true}})
    }
    if(url.endsWith('/api/games')) {
      starts++
      expect(route.request().postDataJSON()).toEqual({tolerance:.25,timeout_seconds:20})
      state={...state,id:'test',game:structuredClone(initial),ready_hold_ms:0,ready_players:[]}
      return route.fulfill({json:{id:'test'}})
    }
    const response=await page.request.get('/poses-graffiti-transparent.png')
    return route.fulfill({body:await response.body(),contentType:'image/png'})
  })
  const errors: string[]=[]
  page.on('pageerror', e=>errors.push(e.message))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/')
  await expect(page.getByRole('button',{name:'START NEW GAME',exact:true})).toHaveCount(0)
  await page.waitForTimeout(2000)
  state={...state,ready_players:[1,2],ready_hold_ms:2000}
  await expect(page.getByRole('timer',{name:'Countdown'})).toContainText('3')
  await expect(page.getByRole('heading',{name:'MAKE A POSE',exact:true})).toBeVisible({timeout:8000})
  expect(starts).toBe(1)
  await expect(page.getByRole('timer',{name:'Countdown'})).toHaveCount(0)
  const settingStage = await page.getByTestId('target-media-stage').boundingBox()
  expect(settingStage).not.toBeNull()
  await expect(page.getByRole('timer')).toContainText('TO SET')
  state.game={...initial,poses:[matrix,matrix],holdMs:1000}
  await expect(page.getByText('2/3 SAVED')).toBeVisible()
  await expect(page.getByRole('progressbar',{name:'Pose hold',exact:true})).toHaveAttribute('value','0.5')
  state.pose_photos=[0,1,2].map(index=>({round:1,index,url:`/api/games/test/photos/1/${index}`}))
  state.game={...initial,phase:'ready',poses:[matrix,matrix,matrix],deadline:3000}
  await expect(page.getByRole('heading',{name:'GET READY TO COPY',exact:true})).toBeVisible()
  await expect(page.getByAltText('Saved pose 1')).toBeVisible()
  await page.getByRole('button',{name:'Skeleton target',exact:true}).click()
  await expect(page.getByRole('img',{name:'Target pose 1',exact:true})).toBeVisible()
  state.game={...state.game,phase:'copying',deadline:20000,error:.4}
  await expect(page.getByText('POSE ERROR 0.400 / 0.250')).toBeVisible()
  const copyingStage = await page.getByTestId('target-media-stage').boundingBox()
  expect(copyingStage?.width).toBeCloseTo(settingStage!.width, 0)
  expect(copyingStage?.height).toBeCloseTo(settingStage!.height, 0)
  await page.screenshot({path:'test-results/copying-desktop.png'})
  state.game={...initial,phase:'handoff',setter:2,round:2,deadline:3000}
  await expect(page.getByRole('heading',{name:'GET READY TO SET',exact:true})).toBeVisible()
  state.game={...initial,setter:2,round:3,letters:[1,0]}
  await expect(page.locator('[aria-label="P1 failures: 1 of 5"]').last()).toBeVisible()
  state.game={...initial,phase:'finished',setter:2,winner:2,letters:[5,0]}
  await expect(page.getByRole('heading',{name:'PLAYER 2 WINS'})).toBeVisible()
  await expect(page.getByAltText(/Match replay photo/)).toBeVisible()
  await expect(page.getByAltText('Match replay photo 2')).toBeVisible()
  await page.getByRole('button',{name:'Pause replay'}).click()
  await expect(page.getByRole('button',{name:'Play replay'})).toBeVisible()
  await page.setViewportSize({width:390,height:844})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({path:'test-results/replay-mobile.png',fullPage:true})
  await page.getByRole('button',{name:'RESET GAME',exact:true}).click()
  await expect(page.getByRole('heading',{name:'READY TO PLAY',exact:true})).toBeVisible()
  await page.waitForTimeout(1200)
  expect(starts).toBe(1)
  await expect(page.getByRole('button',{name:'Pause replay'})).toHaveCount(0)
  expect(errors).toEqual([])
})

test('gesture starts after a three-second countdown and a failed start requires a fresh release', async ({page})=>{
  let state: BackendState={...EMPTY_STATE,status:'Camera ready',camera_ready:true,ready_players:[],ready_hold_ms:0}
  let starts=0
  await page.route('http://127.0.0.1:8000/**',route=>{
    if(route.request().url().endsWith('/api/games')) { starts++;return route.fulfill({status:503,json:{detail:'Database offline'}}) }
    if(route.request().url().endsWith('/api/state')) return route.fulfill({json:state})
    return route.abort()
  })
  await page.goto('/')
  await page.waitForTimeout(2000)
  state={...state,ready_players:[1,2],ready_hold_ms:1500}
  await expect(page.getByRole('progressbar',{name:'Ready gesture hold'})).toHaveAttribute('value','0.75')
  expect(starts).toBe(0)
  state={...state,ready_hold_ms:2000}
  await expect(page.getByRole('alert').filter({hasText:'Database offline'})).toHaveText('Database offline',{timeout:8000})
  expect(starts).toBe(1)
  await page.waitForTimeout(1000)
  expect(starts).toBe(1)
  state={...state,ready_players:[],ready_hold_ms:0}
  await page.waitForTimeout(1000)
  state={...state,ready_players:[1,2],ready_hold_ms:2000}
  await expect.poll(()=>starts,{timeout:5000}).toBe(2)
})

test('finished game requires a real hand release before gesture restart', async ({page})=>{
  const finished: BackendGame = {
    ...initial, phase:'finished', winner:1, deadline:0, message:'Player 1 wins',
  }
  let state: BackendState={
    ...EMPTY_STATE, id:'test', game:finished, status:'Camera ready', camera_ready:true,
    ready_players:[], ready_hold_ms:0,
  }
  let starts=0
  await page.route('http://127.0.0.1:8000/**',route=>{
    if(route.request().url().endsWith('/api/games')) {
      starts++
      state={...state,game:structuredClone(initial),ready_players:[],ready_hold_ms:0}
      return route.fulfill({json:{id:'test'}})
    }
    if(route.request().url().endsWith('/api/state')) return route.fulfill({json:state})
    return route.abort()
  })

  await page.goto('/')
  state={...state,ready_players:[1,2],ready_hold_ms:2000}
  await page.waitForTimeout(1200)
  expect(starts).toBe(0)

  state={...state,ready_players:[],ready_hold_ms:0}
  await page.waitForTimeout(1000)
  state={...state,ready_players:[1,2],ready_hold_ms:2000}
  await expect.poll(()=>starts,{timeout:5000}).toBe(1)
})
