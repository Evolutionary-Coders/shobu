#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * O roteiro de medição de fluidez, repetível: o mesmo caminho a cada correção,
 * para o antes e depois serem comparáveis.
 *
 *   npm run dev   # em outro terminal
 *   node scripts/measure-fluidity.mjs [url] [--gpu] [--label nome]
 *
 * Abre um chrome headless com depuração remota (cdp), entra na arena pelo
 * spawn 0 com `?perf=1`, e roda quatro fases: 30 s parado olhando o centro,
 * 30 s correndo e virando pelo mapa, a luneta aberta, e 5 tiros. De cada fase
 * sai FPS, média, p95, p99, pior quadro e travadas — medidos por um
 * `requestAnimationFrame` próprio, independente do jogo — e a amostra de
 * cena do overlay (draw calls, active meshes, simulação, gpu).
 *
 * O trava de ponteiro é simulada: o headless não a concede, e o jogo só sabe
 * se está "no controle" por ela.
 */
const args = process.argv.slice(2)
const url = new URL(args.find((arg) => arg.startsWith('http')) ?? 'http://localhost:5173/')
url.searchParams.set('perf', '1')
// `--tick-hz N`: a simulação a outra taxa, só no modo de medição (`tickHzOverride.ts`).
if (args.includes('--tick-hz')) url.searchParams.set('tickHz', args[args.indexOf('--tick-hz') + 1])
const useGpu = args.includes('--gpu')
const label = args.includes('--label') ? args[args.indexOf('--label') + 1] : 'medicao'
const PHASE_S = Number(process.env.PHASE_S ?? 30)
/**
 * `--slow` emula o wi-fi da feira, com vários celulares dividindo o ar:
 * 20 Mbit/s e 40 ms de ida e volta. É aí que asset chegando atrasado aparece.
 */
const SLOW_NETWORK = args.includes('--slow')
  ? { offline: false, latency: 40, downloadThroughput: 2_500_000, uploadThroughput: 1_250_000 }
  : undefined

const sleep = (ms) => new Promise((settle) => setTimeout(settle, ms))

async function launchChrome() {
  const port = 9300 + Math.floor(Math.random() * 500)
  const gpuFlags = useGpu ? ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] : []
  const child = spawn(
    'google-chrome-stable',
    [
      '--headless=new',
      '--mute-audio',
      ...gpuFlags,
      '--hide-scrollbars',
      '--window-size=1280,720',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${mkdtempSync(join(tmpdir(), 'shobu-perf-'))}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  return { process: child, port }
}

async function connect(port) {
  const target = await waitForPage(port)
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((settle) => socket.addEventListener('open', settle))
  const pending = new Map()
  let nextId = 0
  socket.addEventListener('message', (message) => onMessage(JSON.parse(message.data), pending))
  const send = (method, params = {}) =>
    new Promise((settle) => {
      nextId += 1
      pending.set(nextId, settle)
      socket.send(JSON.stringify({ id: nextId, method, params }))
    })
  const evaluate = async (expression) =>
    (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result
      ?.result?.value
  return { send, evaluate }
}

/** Resposta a um pedido, ou aviso da página — que vai para o stderr: medição com erro no jogo não vale. */
function onMessage(data, pending) {
  pending.get(data.id)?.(data)
  pending.delete(data.id)
  if (data.method !== 'Runtime.consoleAPICalled') return
  if (!['warning', 'error'].includes(data.params.type)) return
  console.error(data.params.args.map((arg) => arg.value ?? arg.description).join(' '))
}

async function waitForPage(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      const page = targets.find((target) => target.type === 'page')
      if (page) return page
    } catch {
      // o chrome ainda não abriu a porta
    }
    await sleep(200)
  }
  throw new Error(`o chrome não abriu a porta ${port} de depuração em 10 s`)
}

async function runScript(page) {
  const readyAtMs = await bootToMenu(page)
  await key(page, 'Enter')
  const entrada = await phase(page, 'entrada', () => sleep(10_000))
  return {
    readyAtMs,
    resources: await page.evaluate(RESOURCE_COUNT),
    entrada,
    parado: await phase(page, 'parado', () => sleep(PHASE_S * 1000)),
    correndo: await phase(page, 'correndo', () => run(page, PHASE_S)),
    luneta: await phase(page, 'luneta', () => scope(page)),
    primeiroTiro: await firstShot(page),
    tiros: await phase(page, 'tiros', () => shoot(page, 5)),
  }
}

/** Abre a página, pula a intro e espera a carga; devolve quando o menu liberou, em ms desde a navegação. */
async function bootToMenu(page) {
  await page.send('Page.enable')
  await page.send('Runtime.enable')
  // `--reduced-motion` desliga as transições (jack-in, entrada do hud): separa o
  // custo delas do custo do jogo.
  if (args.includes('--reduced-motion')) {
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    })
  }
  if (SLOW_NETWORK) {
    await page.send('Network.enable')
    await page.send('Network.emulateNetworkConditions', SLOW_NETWORK)
  }
  await presetSettings(page)
  await page.send('Page.navigate', { url: url.href })
  await sleep(2500)
  await page.evaluate(FRAME_RECORDER)
  await page.evaluate(FAKE_POINTER_LOCK)
  if (args.includes('--no-fullscreen')) await page.evaluate(NO_FULLSCREEN)
  await key(page, 'Enter')
  await waitUntil(page, 'window.__shobuReady?.()', 120_000)
  return page.evaluate('Math.round(window.__readyAtMs ?? -1)')
}

/**
 * `--quality N` entra com a predefinição de índice N (`qualityPreset.ts`).
 * O jogo lê as configurações do
 * armazenamento no boot, e o parser completa o resto com o padrão.
 */
async function presetSettings(page) {
  const quality = args.indexOf('--quality')
  if (quality < 0) return
  const settings = JSON.stringify({ quality: Number(args[quality + 1]) })
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('shobu.playerSettings', ${JSON.stringify(settings)})`,
  })
}

/** Uma fase: zera o gravador, roda, e devolve os quadros e a última amostra de cena. */
async function phase(page, name, body) {
  await page.evaluate('window.__frames.length = 0')
  await body()
  const frames = await page.evaluate('window.__frames.slice()')
  const scene = await page.evaluate('window.__shobuPerf ?? null')
  return { ...frameSummary(frames), scene, name }
}

function frameSummary(frames) {
  if (frames.length === 0) return { frames: 0 }
  const sorted = [...frames].sort((a, b) => a - b)
  const at = (fraction) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)]
  const mean = frames.reduce((sum, ms) => sum + ms, 0) / frames.length
  const median = at(0.5)
  const round = (value) => Math.round(value * 100) / 100
  return {
    frames: frames.length,
    fps: round(1000 / mean),
    meanMs: round(mean),
    medianMs: round(median),
    p95Ms: round(at(0.95)),
    p99Ms: round(at(0.99)),
    worstMs: round(sorted[sorted.length - 1]),
    hitches: frames.filter((ms) => ms > median * 2).length,
  }
}

async function key(page, code, type = 'both') {
  const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code
  if (type !== 'up') await page.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key })
  if (type !== 'down') await page.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key })
}

async function mouse(page, type, button) {
  await page.send('Input.dispatchMouseEvent', { type, x: 640, y: 360, button, clickCount: 1 })
}

async function turn(page, dx) {
  await page.evaluate(
    `document.querySelector('#arena-canvas').dispatchEvent(new MouseEvent('mousemove', { movementX: ${dx}, movementY: 0, bubbles: true }))`,
  )
}

/** Corre para a frente virando de tempos em tempos: atravessa o mapa sem ficar preso numa parede. */
async function run(page, seconds) {
  await key(page, 'ShiftLeft', 'down')
  await key(page, 'KeyW', 'down')
  for (let step = 0; step < seconds * 4; step += 1) {
    if (step % 8 === 0) await turn(page, 90)
    await sleep(250)
  }
  await key(page, 'KeyW', 'up')
  await key(page, 'ShiftLeft', 'up')
}

async function scope(page) {
  await mouse(page, 'mousePressed', 'right')
  await sleep(60)
  await mouse(page, 'mouseReleased', 'right')
  await sleep(3000)
}

/**
 * O primeiro tiro da partida sozinho: é nele que aparece o shader compilado
 * sob demanda (o feixe, o flash). Mede o pior quadro do segundo seguinte.
 */
async function firstShot(page) {
  await page.evaluate('window.__frames.length = 0')
  await mouse(page, 'mousePressed', 'left')
  await sleep(60)
  await mouse(page, 'mouseReleased', 'left')
  await sleep(1000)
  return frameSummary(await page.evaluate('window.__frames.slice()'))
}

/** Um tiro por ferrolho: o intervalo cobre o ciclo e a recarga do último. */
async function shoot(page, shots) {
  for (let shot = 0; shot < shots; shot += 1) {
    await mouse(page, 'mousePressed', 'left')
    await sleep(60)
    await mouse(page, 'mouseReleased', 'left')
    await sleep(1600)
  }
}

async function waitUntil(page, expression, timeoutMs) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await page.evaluate(expression)) return Date.now() - started
    await sleep(250)
  }
  const phase = await page.evaluate(
    "document.querySelector('#boot-overlay')?.dataset.phase + ' | ' + (document.querySelector('#boot-status, .boot-failure, [data-failure]')?.textContent ?? document.body.innerText.slice(-400))",
  )
  throw new Error(`${expression} não ficou verdadeiro em ${timeoutMs} ms; fase do boot: ${phase}`)
}

/** Grava o intervalo entre quadros com um rAF próprio, e diz quando a carga terminou. */
const FRAME_RECORDER = `
  window.__frames = []
  let last = performance.now()
  const tick = (now) => { window.__frames.push(now - last); last = now; requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  window.__shobuReady = () => {
    const ready = document.querySelector('#boot-overlay')?.dataset.phase === 'ready'
    if (ready) window.__readyAtMs ??= performance.now()
    return ready
  }
`

/** O que a cena guarda na gpu, contado: o webgl não diz a memória, mas diz quantos buffers e texturas. */
const RESOURCE_COUNT = `JSON.stringify({
  geometries: window.__shobuScene?.geometries.length,
  textures: window.__shobuScene?.textures.length,
  meshes: window.__shobuScene?.meshes.length,
  heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6),
})`

/**
 * `--no-fullscreen` corta o pedido de tela cheia: separa o custo da troca de
 * tamanho do canvas (que todo jogo paga ao entrar em tela cheia) do resto.
 */
const NO_FULLSCREEN = `
  Element.prototype.requestFullscreen = () => Promise.resolve()
`

const FAKE_POINTER_LOCK = `
  HTMLCanvasElement.prototype.requestPointerLock = function () {
    Object.defineProperty(document, 'pointerLockElement', { get: () => this, configurable: true })
    document.dispatchEvent(new Event('pointerlockchange'))
    return Promise.resolve()
  }
`

// por último: as funções e as constantes acima já existem quando o roteiro começa.
const chrome = await launchChrome()
try {
  const page = await connect(chrome.port)
  const results = await runScript(page)
  console.log(
    JSON.stringify({ event: 'fluidity-measured', label, url: url.href, gpu: useGpu, results }),
  )
} finally {
  chrome.process.kill()
}
