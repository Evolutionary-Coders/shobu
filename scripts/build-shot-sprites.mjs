#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'

/**
 * Desenha as texturas do tiro — clarão da boca do cano, feixe, faísca de
 * impacto, acerto no corpo, fumaça e furo de bala — e grava os PNG que o
 * cliente carrega:
 *
 *   npm run build:shot-sprites
 *
 * **Procedural, e não baixado.** Cada pixel sai de uma conta com semente fixa
 * (mulberry32), então rodar de novo dá o mesmo arquivo byte a byte: não há
 * origem externa para perder, e a licença é a do repositório
 * (`docs/asset-licenses.md`, seção de efeitos do tiro).
 *
 * Só usa o node: o PNG é escrito à mão com `zlib`, sem canvas nem PIL — o
 * python do sistema não tem PIL, e o build não ganha dependência por quatro
 * imagens pequenas.
 *
 * **O brilho mora na textura.** DESEMPENHO, o padrão, não tem passe de glow
 * (ADR 0014): o halo em volta do núcleo é desenhado aqui, e a soma aditiva no
 * jogo faz o resto.
 */

const OUT = new URL('../packages/client/public/assets/textures/shot/', import.meta.url)

/** A célula do atlas de sprites, em px. Quatro lado a lado. */
const CELL = 128

// ---------------------------------------------------------------- png

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0
    for (let x = 0; x < width * 4; x += 1) {
      raw[y * (width * 4 + 1) + 1 + x] = rgba[y * width * 4 + x]
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bits por canal
  header[9] = 6 // rgba
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function chunk(type, body) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(body.length, 0)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed), 0)
  return Buffer.concat([length, typed, crc])
}

// ---------------------------------------------------------------- tela em float

/** Uma tela em float: rgb e alpha de 0 a 1, convertida para bytes no fim. */
function createCanvas(width, height) {
  return {
    width,
    height,
    rgb: new Float32Array(width * height * 3),
    alpha: new Float32Array(width * height),
  }
}

/**
 * Soma luz num pixel: é o desenho de material aditivo. A cor guardada é a
 * média ponderada pela intensidade, e o alpha é a intensidade somada — que é
 * o que o `ALPHA_ADD` do babylon multiplica.
 */
function addLight(canvas, x, y, color, intensity) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height || intensity <= 0) return
  const index = y * canvas.width + x
  const before = canvas.alpha[index]
  const after = before + intensity
  for (let channel = 0; channel < 3; channel += 1) {
    canvas.rgb[index * 3 + channel] =
      (canvas.rgb[index * 3 + channel] * before + color[channel] * intensity) / after
  }
  canvas.alpha[index] = after
}

/** Pinta por cima, com alpha: é o desenho do furo e da fumaça. */
function paint(canvas, x, y, color, alpha) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height || alpha <= 0) return
  const index = y * canvas.width + x
  const a = Math.min(1, alpha)
  const before = canvas.alpha[index]
  const out = a + before * (1 - a)
  for (let channel = 0; channel < 3; channel += 1) {
    const under = canvas.rgb[index * 3 + channel] * before * (1 - a)
    canvas.rgb[index * 3 + channel] = out > 0 ? (color[channel] * a + under) / out : 0
  }
  canvas.alpha[index] = out
}

/** Copia a tela para os bytes do png, na coluna `offsetX`. */
function blit(canvas, rgba, rgbaWidth, offsetX) {
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const from = y * canvas.width + x
      const to = (y * rgbaWidth + offsetX + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        rgba[to + channel] = byte(canvas.rgb[from * 3 + channel])
      }
      rgba[to + 3] = byte(canvas.alpha[from])
    }
  }
}

const byte = (value) => Math.max(0, Math.min(255, Math.round(value * 255)))

// ---------------------------------------------------------------- utilidades

/** Gerador com semente (mulberry32): o mesmo arquivo a cada execução. */
function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const mix = (a, b, t) => a.map((value, index) => value + (b[index] - value) * t)
const smooth = (edge0, edge1, x) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Ruído de valor em grade, interpolado: a textura da fumaça e da chama. */
function valueNoise(random, size) {
  const grid = Array.from({ length: size * size }, random)
  return (x, y) => {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = smooth(0, 1, x - x0)
    const fy = smooth(0, 1, y - y0)
    const at = (gx, gy) =>
      grid[(((gy % size) + size) % size) * size + (((gx % size) + size) % size)]
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx
    return top + (bottom - top) * fy
  }
}

function fbm(noise, x, y) {
  return (noise(x, y) * 0.55 + noise(x * 2, y * 2) * 0.3 + noise(x * 4, y * 4) * 0.15) / 1
}

const WHITE = [1, 1, 1]
const HOT = [1, 0.95, 0.82]
const AMBER = [1, 0.62, 0.22]
const EMBER = [1, 0.36, 0.12]
const CYAN = [0.2, 0.95, 1]
const MAGENTA = [1, 0.2, 0.75]

// ---------------------------------------------------------------- desenhos

/**
 * Visita cada pixel com as coordenadas que todo desenho aqui usa: o deslocamento
 * do centro em px e o raio normalizado (1 na borda da célula).
 */
function eachPixel(canvas, draw) {
  const centerX = canvas.width / 2
  const centerY = canvas.height / 2
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const dx = x + 0.5 - centerX
      const dy = y + 0.5 - centerY
      draw(x, y, dx, dy, Math.hypot(dx, dy) / centerX)
    }
  }
}

/** Um ponto a `distance` px do centro, no ângulo dado, arredondado ao pixel. */
function pointAt(angle, distance) {
  const center = CELL / 2
  return [
    Math.round(center + Math.cos(angle) * distance),
    Math.round(center + Math.sin(angle) * distance),
  ]
}

/** Uma mancha gaussiana de raio `width` px em volta de (px, py). */
function addBlob(canvas, px, py, width, color, intensity) {
  for (let oy = -2; oy <= 2; oy += 1) {
    for (let ox = -2; ox <= 2; ox += 1) {
      const falloff = Math.exp(-(ox * ox + oy * oy) / (width * width))
      addLight(canvas, Math.round(px + ox), Math.round(py + oy), color, falloff * intensity)
    }
  }
}

/** A faísca do impacto na parede: estrias saindo do ponto, núcleo branco e brasas. */
function drawSpark(random) {
  const canvas = createCanvas(CELL, CELL)
  eachPixel(canvas, (x, y, _dx, _dy, r) => {
    addLight(canvas, x, y, mix(WHITE, AMBER, Math.min(1, r * 3)), Math.exp(-r * r * 60) * 1.2)
    addLight(canvas, x, y, AMBER, Math.exp(-r * r * 9) * 0.22)
  })
  const streaks = 14
  for (let streak = 0; streak < streaks; streak += 1) {
    const angle = (streak / streaks) * Math.PI * 2 + random() * 0.4
    drawStreak(canvas, angle, (CELL / 2) * (0.45 + random() * 0.5))
  }
  for (let ember = 0; ember < 10; ember += 1) {
    const [px, py] = pointAt(random() * Math.PI * 2, (CELL / 2) * (0.35 + random() * 0.55))
    addLight(canvas, px, py, AMBER, 0.9)
    addLight(canvas, px + 1, py, EMBER, 0.4)
  }
  return canvas
}

/** Uma estria da faísca: grossa e quente no centro, fina e vermelha na ponta. */
function drawStreak(canvas, angle, length) {
  const center = CELL / 2
  const steps = length * 3
  for (let step = 0; step < steps; step += 1) {
    const t = step / steps
    const px = center + Math.cos(angle) * t * length
    const py = center + Math.sin(angle) * t * length
    addBlob(canvas, px, py, 1.6 * (1 - t) + 0.4, mix(HOT, EMBER, t), 0.12 * (1 - t))
  }
}

/**
 * O acerto no corpo, no idioma do jogo: um hexágono partido de luz ciano, um
 * losango de mira no meio e cacos de glitch magenta. Nada de sangue.
 */
function drawBodyHit(random) {
  const canvas = createCanvas(CELL, CELL)
  eachPixel(canvas, (x, y, dx, dy, r) => {
    addLight(canvas, x, y, WHITE, Math.exp(-r * r * 90) * 1.3)
    addLight(canvas, x, y, MAGENTA, Math.exp(-r * r * 10) * 0.25)
    addLight(canvas, x, y, CYAN, brokenHexagon(dx, dy, r) * 0.95)
    const diamond = (Math.abs(dx) + Math.abs(dy)) / (CELL / 2)
    addLight(canvas, x, y, mix(WHITE, CYAN, 0.4), Math.exp(-((diamond - 0.26) ** 2) / 0.0006) * 0.8)
  })
  drawAimTicks(canvas)
  drawGlitchShards(canvas, random)
  return canvas
}

/** O anel hexagonal de raio 0,62, com dois dos seis lados quase apagados. */
function brokenHexagon(dx, dy, r) {
  const angle = Math.atan2(dy, dx)
  const sector = Math.PI / 3
  const local = (((angle % sector) + sector) % sector) - sector / 2
  const hexRadius = (r * Math.cos(local)) / Math.cos(Math.PI / 6)
  const ring = Math.exp(-((hexRadius - 0.62) ** 2) / 0.0012)
  const side = Math.floor(((((angle + Math.PI) / sector) % 6) + 6) % 6)
  return side === 1 || side === 4 ? ring * 0.12 : ring
}

/** As quatro marcas de mira, nas diagonais e para fora do hexágono. */
function drawAimTicks(canvas) {
  for (let tick = 0; tick < 4; tick += 1) {
    const angle = (tick * Math.PI) / 2 + Math.PI / 4
    for (let step = 0; step < 14; step += 1) {
      const [px, py] = pointAt(angle, (CELL / 2) * 0.72 + step)
      addLight(canvas, px, py, CYAN, 0.9 - step * 0.05)
    }
  }
}

/** Cacos de glitch: traços curtos e horizontais, como linha de varredura quebrada. */
function drawGlitchShards(canvas, random) {
  for (let shard = 0; shard < 16; shard += 1) {
    const [px, py] = pointAt(random() * Math.PI * 2, (CELL / 2) * (0.3 + random() * 0.6))
    const width = 3 + Math.floor(random() * 9)
    const color = random() < 0.6 ? MAGENTA : CYAN
    for (let ox = 0; ox < width; ox += 1) {
      addLight(canvas, px + ox, py, color, 0.85)
      addLight(canvas, px + ox, py + 1, color, 0.4)
    }
  }
}

/** O halo redondo: a luz do clarão no ar, sem forma. É o que lê à noite sem bloom. */
function drawGlow() {
  const canvas = createCanvas(CELL, CELL)
  eachPixel(canvas, (x, y, _dx, _dy, r) => {
    const edge = 1 - smooth(0.85, 1, r)
    const intensity = (Math.exp(-r * r * 7) * 0.8 + Math.exp(-r * r * 50) * 0.5) * edge
    addLight(canvas, x, y, mix(HOT, AMBER, Math.min(1, r * 1.4)), intensity)
  })
  return canvas
}

/** A fumaça: ruído suave dentro de um círculo esfumado, cinza, para mistura alfa. */
function drawSmoke(random) {
  const canvas = createCanvas(CELL, CELL)
  const noise = valueNoise(random, 16)
  eachPixel(canvas, (x, y, _dx, _dy, r) => {
    const density = fbm(noise, x / 14, y / 14)
    const shape = (1 - smooth(0.35, 1, r + (density - 0.5) * 0.5)) * (0.45 + density * 0.55)
    const grey = 0.55 + density * 0.2
    paint(canvas, x, y, [grey, grey, grey * 1.04], shape * 0.7)
  })
  return canvas
}

/** A estrela do clarão vista de frente: seis pontas, alternando longa e curta. */
function drawFlashStar(random) {
  const canvas = createCanvas(CELL, CELL)
  const lengths = Array.from(
    { length: STAR_SPIKES },
    (_, index) => (index % 2 === 0 ? 0.95 : 0.6) - random() * 0.1,
  )
  eachPixel(canvas, (x, y, dx, dy, r) => {
    const core = Math.exp(-r * r * 30)
    const color = mix(WHITE, AMBER, Math.min(1, r * 1.6))
    addLight(canvas, x, y, color, starSpike(dx, dy, r, lengths) * 0.9 + core * 1.1)
    addLight(canvas, x, y, AMBER, Math.exp(-r * r * 6) * 0.18)
  })
  return canvas
}

const STAR_SPIKES = 6

/** O brilho da ponta da estrela em que o pixel cai: afina até zero no fim dela. */
function starSpike(dx, dy, r, lengths) {
  const angle = Math.atan2(dy, dx) + Math.PI
  const sector = (Math.PI * 2) / STAR_SPIKES
  const index = Math.floor(angle / sector) % STAR_SPIKES
  const offset = (angle - (index + 0.5) * sector) / (sector / 2)
  const left = Math.max(0, 1 - r / (lengths[index] ?? 0.7))
  const width = left * 0.55
  return Math.exp(-(offset * offset) / Math.max(1e-4, width * width)) * left
}

/**
 * A chama vista de lado: a boca do cano à esquerda (u = 0) e a ponta à
 * direita. Larga na base, afinando, com franja de ruído — é o que os dois
 * quads cruzados mostram de qualquer ângulo.
 */
function drawFlashSide(random) {
  const canvas = createCanvas(CELL, CELL)
  const noise = valueNoise(random, 12)
  eachPixel(canvas, (x, y, _dx, dy) => {
    const u = (x + 0.5) / CELL
    const v = Math.abs(dy) / (CELL / 2)
    const lick = fbm(noise, u * 6, (y / CELL) * 6)
    const halfWidth =
      (0.12 + 0.55 * Math.sin(Math.min(1, u * 1.4) * Math.PI) * (1 - u)) * (0.75 + lick * 0.5)
    const inside = Math.exp(-(v * v) / Math.max(1e-4, halfWidth * halfWidth))
    const fade = (1 - smooth(0.55, 1, u)) * smooth(0, 0.04, u)
    const heat = Math.max(0, 1 - u * 1.8 - v * 1.2)
    addLight(canvas, x, y, mix(AMBER, WHITE, heat), inside * fade * (0.6 + heat * 0.8))
  })
  return canvas
}

/**
 * O corte transversal do feixe: em v, o núcleo fino e quase saturado e a
 * queda larga em volta; em u, nada muda. Branco: a cor vem do material.
 */
function drawTracerProfile() {
  const canvas = createCanvas(4, 64)
  eachPixel(canvas, (x, y, _dx, dy) => {
    const v = dy / (canvas.height / 2)
    const intensity = Math.exp(-v * v * 40) * 0.9 + Math.exp(-v * v * 6) * 0.35
    addLight(canvas, x, y, WHITE, intensity * (1 - smooth(0.85, 1, Math.abs(v))))
  })
  return canvas
}

/** O furo: o buraco escuro, a coroa de queimado com ruído e algumas trincas. */
function drawBulletHole(random) {
  const canvas = createCanvas(64, 64)
  const noise = valueNoise(random, 10)
  const cracks = Array.from({ length: 6 }, () => ({
    angle: random() * Math.PI * 2,
    length: 0.5 + random() * 0.45,
  }))
  eachPixel(canvas, (x, y, dx, dy, r) => {
    const grain = fbm(noise, x / 6, y / 6)
    paint(
      canvas,
      x,
      y,
      [0.09, 0.08, 0.075],
      (1 - smooth(0.25, 0.85, r + (grain - 0.5) * 0.35)) * 0.6,
    )
    paint(canvas, x, y, [0.04, 0.04, 0.04], crackShade(Math.atan2(dy, dx), r, cracks))
    paint(canvas, x, y, [0.01, 0.01, 0.012], 1 - smooth(0.13, 0.2, r))
    // a borda metálica arrancada pega a luz: um anel fino mais claro
    paint(canvas, x, y, [0.45, 0.42, 0.38], Math.exp(-((r - 0.22) ** 2) / 0.0015) * 0.35)
  })
  return canvas
}

/** Quanto de trinca cai no pixel: a mais escura das que passam por ele. */
function crackShade(angle, r, cracks) {
  const turn = Math.PI * 2
  let shade = 0
  for (const crack of cracks) {
    // atan2 vai de -π a π e a trinca de 0 a 2π: a diferença volta para [0, π].
    const raw = (((angle - crack.angle) % turn) + turn) % turn
    const delta = Math.min(raw, turn - raw)
    const onCrack = r > 0.15 && r < crack.length && delta * r * 32 < 0.7
    if (onCrack) shade = Math.max(shade, 0.7 * (1 - r / crack.length))
  }
  return shade
}

// ---------------------------------------------------------------- saída

function writeAtlas(name, cells) {
  const width = cells.reduce((sum, cell) => sum + cell.width, 0)
  const height = Math.max(...cells.map((cell) => cell.height))
  const rgba = new Uint8Array(width * height * 4)
  let offset = 0
  for (const cell of cells) {
    blit(cell, rgba, width, offset)
    offset += cell.width
  }
  const png = encodePng(width, height, rgba)
  writeFileSync(new URL(name, OUT), png)
  console.log(
    JSON.stringify({ event: 'shot-sprite-written', name, width, height, bytes: png.length }),
  )
}

// a ordem das células é contrato com `SHOT_SPRITE_CELL` em `shotSprites.ts`.
writeAtlas('shot-sprites.png', [
  drawSpark(seeded(11)),
  drawBodyHit(seeded(23)),
  drawGlow(),
  drawSmoke(seeded(37)),
])
// a estrela à esquerda e a chama de lado à direita: contrato com `muzzleFlashMesh.ts`.
writeAtlas('muzzle-flash.png', [drawFlashStar(seeded(41)), drawFlashSide(seeded(53))])
writeAtlas('tracer-profile.png', [drawTracerProfile()])
writeAtlas('bullet-hole.png', [drawBulletHole(seeded(67))])
