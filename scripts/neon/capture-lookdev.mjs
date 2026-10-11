#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Fotografa o recorte do look-dev **no babylon**, com o código de cenário do
 * jogo, nas mesmas quatro vistas do render do blender:
 *
 *   npx vite --config scripts/neon/lookdev-harness/vite.config.mjs   # em outro terminal
 *   node scripts/neon/capture-lookdev.mjs <pasta-de-saida> [--quality performance|quality]
 *
 * O render do blender tem reflexo e névoa volumétrica de verdade; o jogo tem
 * lightmap, névoa exponencial e cartão aditivo. Só esta captura diz se o
 * look-dev sobrevive à troca — e mede draw calls e triângulos da cena real.
 *
 * Chrome headless com gpu e `--mute-audio`; o `requestAnimationFrame` roda no
 * headless, então a página espera 60 quadros e devolve a leitura em
 * `window.lookdev`.
 */
const args = process.argv.slice(2)
const outDir = args.find((arg) => !arg.startsWith('--')) ?? 'assets/work/neon/lookdev'
const quality = args.includes('--quality') ? args[args.indexOf('--quality') + 1] : 'performance'
const BASE = 'http://localhost:5199/'
const VIEWS = (process.env.VIEWS ?? 'rua,passarela,telhado,beco').split(',')

const sleep = (ms) => new Promise((settle) => setTimeout(settle, ms))

async function launchChrome() {
  const port = 9300 + Math.floor(Math.random() * 500)
  const profile = mkdtempSync(join(tmpdir(), 'shobu-lookdev-'))
  const child = spawn(
    'google-chrome-stable',
    [
      '--headless=new',
      '--mute-audio',
      '--use-angle=gl',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--hide-scrollbars',
      '--window-size=1600,900',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  return { child, port, profile }
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

async function connect(port) {
  const socket = new WebSocket((await waitForPage(port)).webSocketDebuggerUrl)
  await new Promise((settle) => socket.addEventListener('open', settle))
  const pending = new Map()
  let nextId = 0
  socket.addEventListener('message', (message) => {
    const data = JSON.parse(message.data)
    pending.get(data.id)?.(data)
    pending.delete(data.id)
  })
  const send = (method, params = {}) =>
    new Promise((settle) => {
      nextId += 1
      pending.set(nextId, settle)
      socket.send(JSON.stringify({ id: nextId, method, params }))
    })
  return { send, socket }
}

async function readLookdev(send) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const reply = await send('Runtime.evaluate', {
      expression: 'JSON.stringify(window.lookdev ?? null)',
      returnByValue: true,
    })
    const value = JSON.parse(reply.result?.result?.value ?? 'null')
    if (value?.ready) return value
    await sleep(500)
  }
  throw new Error('a página não ficou pronta em 120 s; esperado window.lookdev.ready')
}

async function captureView(send, view) {
  await send('Page.navigate', { url: `${BASE}?view=${view}&quality=${quality}` })
  const reading = await readLookdev(send)
  if (reading.error) throw new Error(`vista ${view}: ${reading.error}`)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const suffix = quality === 'performance' ? '' : `-${quality}`
  writeFileSync(
    join(outDir, `lookdev-jogo-${view}${suffix}.png`),
    Buffer.from(shot.result.data, 'base64'),
  )
  return { view, quality, ...reading }
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  const chrome = await launchChrome()
  try {
    const { send, socket } = await connect(chrome.port)
    await send('Page.enable')
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1600,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    })
    const readings = []
    for (const view of VIEWS) readings.push(await captureView(send, view))
    console.log(JSON.stringify({ event: 'lookdev-captured', readings }, null, 1))
    socket.close()
  } finally {
    // o perfil só sai depois que o chrome fecha: apagado antes, ele ainda
    // escreve nele, e o rmSync falha com a pasta não vazia.
    const exited = new Promise((settle) => chrome.child.once('exit', settle))
    chrome.child.kill()
    await exited
    rmSync(chrome.profile, { recursive: true, force: true })
  }
}

await main()
