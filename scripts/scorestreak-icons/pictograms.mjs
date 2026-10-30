/**
 * Os doze pictogramas das séries de pontuação, num quadro de 128 × 128 com o
 * cartão por baixo (`build-scorestreak-icons.mjs`). Cada um é silhueta chapada
 * em `INK_COLOR`; onde uma forma precisa se separar de outra, o recorte é
 * desenhado na cor do cartão em vez de usar transparência — fica duas cores
 * só, como um sprite de PS1.
 *
 * Traço padrão de 8 unidades (3 px a 48 px) e área útil de ~16 a ~112: é o que
 * mantém o conjunto com o mesmo peso visual quando um ícone tem linha e o
 * outro tem massa.
 */
export const INK_COLOR = '#ece8df'
export const CARD_COLOR = '#1b1d22'

const STROKE = 8

export const PICTOGRAMS = {
  ping,
  echo,
  'grapple-overclock': grappleOverclock,
  decoy,
  'counter-ping': counterPing,
  'optic-camo': opticCamo,
  'rapid-bolt': rapidBolt,
  sonar,
  'orbital-strike': orbitalStrike,
  'kamikaze-drone': kamikazeDrone,
  emp,
  'neon-sentry': neonSentry,
}

/** PING: o radar do UAV — anel, varredura e dois inimigos marcados. */
function ping() {
  return [
    ring(64, 66, 42, 6),
    ring(64, 66, 16, 4),
    wedge(64, 66, 42, -100, -40),
    dot(64, 66, 5),
    blip(64, 66, 29, 35),
    blip(64, 66, 29, 155),
  ].join('')
}

/** ECO: a caveira de quem te matou, com o eco saindo dos dois lados. */
function echo() {
  return [skull(64, 62), ...echoArcs(64, 66, 0), ...echoArcs(64, 66, 180)].join('')
}

function skull(cx, cy) {
  return [
    dot(cx, cy, 22),
    rect(cx - 13, cy + 10, 26, 22, INK_COLOR, 3),
    dot(cx - 9, cy + 1, 6.5, CARD_COLOR),
    dot(cx + 9, cy + 1, 6.5, CARD_COLOR),
    polygon(`${cx},${cy + 9} ${cx - 4},${cy + 16} ${cx + 4},${cy + 16}`, CARD_COLOR),
    line(cx - 4, cy + 22, cx - 4, cy + 32, 3, CARD_COLOR),
    line(cx + 4, cy + 22, cx + 4, cy + 32, 3, CARD_COLOR),
  ].join('')
}

function echoArcs(cx, cy, facing) {
  return [
    arc(cx, cy, 33, facing - 32, facing + 32, 6),
    arc(cx, cy, 46, facing - 26, facing + 26, 5),
  ]
}

/** GANCHO OVERCLOCK: a garra do gancho, puxada por linhas de velocidade. */
function grappleOverclock() {
  return [
    path('M80,30 Q80,18 90,16 Q98,14 98,8', 'none', 5),
    rect(74, 24, 12, 10),
    line(80, 30, 80, 98, STROKE),
    polygon('74,96 80,110 86,96'),
    path('M58,70 Q58,98 80,98 Q102,98 102,70', 'none', STROKE),
    polygon('52,74 58,58 64,74'),
    polygon('96,74 102,58 108,74'),
    line(16, 44, 46, 44, 6),
    line(24, 60, 50, 60, 6),
    line(14, 76, 42, 76, 6),
  ].join('')
}

/** HOLOGRAMA ISCA: você e, atrás, a cópia em linhas de varredura. */
function decoy() {
  return [
    `<clipPath id="scan">${scanlines(14, 114, 10, 5)}</clipPath>`,
    `<g clip-path="url(#scan)">${person(80, 26)}</g>`,
    `<g stroke="${CARD_COLOR}" stroke-width="6">${person(50, 36)}</g>`,
    person(50, 36),
  ].join('')
}

/** CONTRA-PING: o radar do PING riscado — o UAV deles desligado. */
function counterPing() {
  return [
    ring(64, 66, 42, 6),
    ring(64, 66, 22, 4),
    dot(64, 66, 6),
    line(28, 102, 100, 30, 18, CARD_COLOR),
    line(28, 102, 100, 30, 9),
  ].join('')
}

/** CAMUFLAGEM ÓPTICA: metade do corpo sólida, a outra metade se desfazendo em pontilhado. */
function opticCamo() {
  return [
    '<pattern id="dither" width="8" height="8" patternUnits="userSpaceOnUse">',
    `${rect(0, 0, 4, 4)}${rect(4, 4, 4, 4)}</pattern>`,
    '<clipPath id="left"><rect x="0" y="0" width="64" height="128"/></clipPath>',
    '<clipPath id="right"><rect x="68" y="0" width="60" height="128"/></clipPath>',
    `<g clip-path="url(#left)">${person(64, 32)}</g>`,
    `<g clip-path="url(#right)" fill="url(#dither)">${person(64, 32, 'url(#dither)')}</g>`,
  ].join('')
}

/** FERROLHO RÁPIDO: o ferrolho da sniper com a alavanca, e o avanço duplo. */
function rapidBolt() {
  return [
    rect(14, 52, 56, 18, INK_COLOR, 3),
    rect(68, 47, 10, 28, INK_COLOR, 2),
    line(26, 52, 26, 70, 3, CARD_COLOR),
    line(46, 66, 54, 90, STROKE),
    dot(56, 96, 9),
    chevron(84, 46, 30),
    chevron(100, 46, 30),
  ].join('')
}

/** SONAR: a onda que nasce de um ponto e atravessa a parede. */
function sonar() {
  return [
    brickWall(52, 18, 14, 92),
    dot(28, 64, 7),
    arc(28, 64, 16, -55, 55, 5),
    arc(28, 64, 50, -32, 32, 6),
    arc(28, 64, 66, -30, 30, 6),
    arc(28, 64, 82, -28, 28, 6),
  ].join('')
}

/** GOLPE ORBITAL: o satélite e a coluna de laser caindo no alvo. */
function orbitalStrike() {
  return [
    ellipseRing(64, 100, 38, 11, 5),
    ellipse(64, 100, 16, 5),
    polygon('57,34 71,34 80,100 48,100', INK_COLOR, CARD_COLOR, 5),
    rect(54, 14, 20, 20, INK_COLOR, 2),
    line(30, 24, 98, 24, 4),
    rect(20, 16, 22, 16),
    rect(86, 16, 22, 16),
  ].join('')
}

/** DRONE KAMIKAZE: o quadricóptero de frente, com a ogiva pendurada. */
function kamikazeDrone() {
  return [
    line(22, 44, 106, 44, 7),
    line(30, 44, 30, 34, 6),
    line(98, 44, 98, 34, 6),
    rect(12, 28, 36, 7, INK_COLOR, 3),
    rect(80, 28, 36, 7, INK_COLOR, 3),
    polygon('46,38 82,38 76,60 52,60'),
    dot(64, 49, 4, CARD_COLOR),
    line(64, 60, 64, 68, 6),
    path('M64,66 C80,66 80,92 64,110 C48,92 48,66 64,66 Z'),
    line(52, 78, 76, 78, 3, CARD_COLOR),
  ].join('')
}

/** PULSO EMP: o raio no centro de um estouro em anel. */
function emp() {
  const spikes = [0, 45, 90, 135, 180, 225, 270, 315].map((angle) => spike(64, 64, angle))
  return [
    ring(64, 64, 34, 6),
    ...spikes,
    dot(64, 64, 26, CARD_COLOR),
    polygon('72,28 44,70 60,70 54,100 84,56 68,56 78,28'),
  ].join('')
}

/** CAÇADOR NEON: a torre sentinela no tripé, cano para a direita. */
function neonSentry() {
  return [
    line(58, 64, 26, 106, 7),
    line(58, 64, 92, 106, 7),
    line(58, 64, 58, 108, 7),
    rect(50, 54, 16, 14),
    polygon('30,40 44,26 82,26 82,58 40,58 30,48'),
    rect(82, 34, 22, 8),
    rect(82, 46, 22, 8),
    rect(102, 31, 10, 26),
    line(40, 42, 66, 42, 4, CARD_COLOR),
  ].join('')
}

/** Inimigo marcado no radar, entre o anel de dentro e o de fora. */
function blip(cx, cy, radius, degrees) {
  const [x, y] = polar(cx, cy, radius, degrees)
  return dot(x, y, 5.5)
}

/** Busto: cabeça e ombros, a silhueta de jogador que três ícones reusam. */
function person(cx, top, fill = INK_COLOR) {
  const shoulders = top + 30
  const bottom = top + 76
  const body = [
    `M${cx - 30},${bottom} L${cx - 30},${shoulders + 14}`,
    `Q${cx - 30},${shoulders} ${cx - 14},${shoulders} L${cx + 14},${shoulders}`,
    `Q${cx + 30},${shoulders} ${cx + 30},${shoulders + 14} L${cx + 30},${bottom} Z`,
  ].join(' ')
  return dot(cx, top + 12, 13, fill) + path(body, fill)
}

function scanlines(top, bottom, pitch, thickness) {
  const rows = []
  for (let y = top; y < bottom; y += pitch) rows.push(rect(0, y, 128, thickness))
  return rows.join('')
}

function brickWall(x, y, width, height) {
  const joints = []
  for (let row = y + 15; row < y + height; row += 15) {
    joints.push(line(x, row, x + width, row, 3, CARD_COLOR))
  }
  return rect(x, y, width, height) + joints.join('')
}

function chevron(x, top, height) {
  const tip = `${x + height / 2},${top + height / 2}`
  return polyline(`${x},${top} ${tip} ${x},${top + height}`, STROKE)
}

function spike(cx, cy, angle) {
  const base = [polar(cx, cy, 40, angle - 9), polar(cx, cy, 40, angle + 9)]
  const tip = polar(cx, cy, 54, angle)
  return polygon([...base, tip].map(([x, y]) => `${x},${y}`).join(' '))
}

function polar(cx, cy, radius, degrees) {
  const radians = (degrees * Math.PI) / 180
  return [round(cx + radius * Math.cos(radians)), round(cy + radius * Math.sin(radians))]
}

function round(value) {
  return Math.round(value * 10) / 10
}

function ring(cx, cy, r, width) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${INK_COLOR}" stroke-width="${width}"/>`
}

function dot(cx, cy, r, fill = INK_COLOR) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`
}

function ellipse(cx, cy, rx, ry) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${INK_COLOR}"/>`
}

function ellipseRing(cx, cy, rx, ry, width) {
  const shape = `cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"`
  return `<ellipse ${shape} fill="none" stroke="${INK_COLOR}" stroke-width="${width}"/>`
}

function rect(x, y, width, height, fill = INK_COLOR, radius = 0) {
  const box = `x="${x}" y="${y}" width="${width}" height="${height}"`
  return `<rect ${box} rx="${radius}" fill="${fill}"/>`
}

function line(x1, y1, x2, y2, width, color = INK_COLOR) {
  const ends = `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`
  return `<line ${ends} stroke="${color}" stroke-width="${width}"/>`
}

function polyline(points, width) {
  const stroke = `stroke="${INK_COLOR}" stroke-width="${width}"`
  return `<polyline points="${points}" fill="none" ${stroke} stroke-linejoin="miter"/>`
}

function polygon(points, fill = INK_COLOR, stroke = 'none', width = 0) {
  return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`
}

function path(d, fill = INK_COLOR, width = 0) {
  const stroke = width > 0 ? ` stroke="${INK_COLOR}" stroke-width="${width}"` : ''
  return `<path d="${d}" fill="${fill}"${stroke}/>`
}

/** Arco de círculo em graus, 0 à direita e crescendo no sentido horário (o y do svg desce). */
function arc(cx, cy, r, fromDegrees, toDegrees, width) {
  const [x1, y1] = polar(cx, cy, r, fromDegrees)
  const [x2, y2] = polar(cx, cy, r, toDegrees)
  const large = toDegrees - fromDegrees > 180 ? 1 : 0
  return path(`M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2}`, 'none', width)
}

/** Fatia de pizza cheia: a varredura do radar. */
function wedge(cx, cy, r, fromDegrees, toDegrees) {
  const [x1, y1] = polar(cx, cy, r, fromDegrees)
  const [x2, y2] = polar(cx, cy, r, toDegrees)
  return path(`M${cx},${cy} L${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2} Z`)
}
