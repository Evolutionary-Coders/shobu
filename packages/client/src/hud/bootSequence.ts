import type { GameplayConfig } from '@shobu/core'

/**
 * O roteiro do boot de terminal. É dado puro, montado a partir de
 * `config/gameplay.json`: os números que passam na tela são **os mesmos** que o
 * jogo vai usar no tick seguinte, não texto decorativo. Trocar o fov no json
 * troca o fov na intro, e é assim que ela não vira mentira com o tempo.
 *
 * Cada linha carrega o canto da tela em que sai. As três correm na mesma
 * linha do tempo, então a tela enche por todos os lados de uma vez em vez de
 * rolar um bloco só.
 */
export type BootChannel = 'telemetry' | 'main' | 'uplink'
export type BootTone = 'system' | 'ok' | 'warn' | 'accent'

export interface BootLine {
  readonly channel: BootChannel
  readonly text: string
  readonly tone: BootTone
  /** Pausa antes desta linha aparecer. É o ritmo da intro. */
  readonly delayMs: number
}

const LABEL_COLUMN = 18

/** Terminal vazio piscando antes de a primeira linha sair. */
export const INTRO_IDLE_BEAT_MS = 620

/** Duração da entrada do logo, casada com `logo-slam` no hud.css. */
export const INTRO_LOGO_REVEAL_MS = 640

/**
 * ```ts
 * const lines = buildBootSequence(config)
 * lines[0].channel // 'main'
 * ```
 */
export function buildBootSequence(config: GameplayConfig): readonly BootLine[] {
  return [
    ...openingLines(),
    ...telemetryLines(config),
    ...arenaLines(config),
    ...ruleLines(config),
    ...uplinkLines(config),
    ...closingLines(),
  ]
}

/**
 * Quanto a intro inteira leva se ninguém pular: piscada inicial, impressão e
 * entrada do logo. Existe para o teste vigiar o pilar 2 — uma cinemática que
 * cresce sem ninguém olhar é o jeito mais fácil de estourar os cinco segundos.
 */
export function introDurationMs(lines: readonly BootLine[]): number {
  const printing = lines.reduce((total, line) => total + line.delayMs, 0)
  return INTRO_IDLE_BEAT_MS + printing + INTRO_LOGO_REVEAL_MS
}

function openingLines(): readonly BootLine[] {
  return [
    line('main', 'アクセス許可 // ACCESS GRANTED', 'accent', 300),
    line('telemetry', 'NEURO-OPTICS :: LINK ESTABELECIDO', 'system', 60),
  ]
}

function telemetryLines(config: GameplayConfig): readonly BootLine[] {
  const { simulation, camera, collision, weapon, grapple } = config
  return [
    telemetry(`RENDER ....... WEBGL2 // BABYLON 9`),
    telemetry(`SYNC ......... TICK ${simulation.tickHz}Hz | SNAP ${simulation.snapshotHz}Hz`),
    telemetry(`CORTEX ....... FOV ${camera.baseFovDeg}° | MIRA ${camera.scopedFovDeg}°`),
    telemetry(`CHASSI ....... R ${collision.capsuleRadiusM}m | H ${collision.capsuleHeightM}m`),
    telemetry(`WEAPON_LINK .. HITSCAN ${weapon.hitscanRangeM}m [ONLINE]`),
    telemetry(`GRAPPLE ...... ${grapple.maxRangeM}m | CD ${grapple.cooldownS}s`),
  ]
}

function arenaLines(config: GameplayConfig): readonly BootLine[] {
  return [
    field('LOC', 'SECTOR-BRASIL [-27.5954,-48.5480]'),
    field('ARENA', '3 CAMADAS / 12 SPAWNS'),
    field('SALA', `${config.match.playersPerRoom} JOGADORES / ${config.match.durationS}s`),
    field('RESPAWN', `${config.match.respawnDelayS}s`),
  ]
}

function ruleLines(config: GameplayConfig): readonly BootLine[] {
  return [
    field('PROGRESSÃO', 'NENHUMA', 'warn'),
    field('VIDA', 'UM TIRO MATA', 'warn'),
    field('VELOCIDADE', `PISO ${config.movement.runSpeedMps} m/s`, 'warn'),
    field('SHŌBU_NET', 'UP [STIM_ACTIVE]', 'accent'),
  ]
}

function uplinkLines(config: GameplayConfig): readonly BootLine[] {
  const substep = config.collision.subStepMaxDisplacementM
  return [
    uplink('uplink: websocket // snapshot interpolado, rewind no instante do tiro'),
    uplink('autoridade: servidor  //  predição: cliente  //  mesmo módulo nos dois'),
    uplink(`colisão: varredura de cápsula, sub-passo a cada ${substep} m`),
    uplink('determinismo: tick fixo, rng semeado, sem Math.random no núcleo'),
  ]
}

function closingLines(): readonly BootLine[] {
  return [
    line('uplink', '> boot completo ... bem-vindo ao shōbu', 'accent', 220),
    line('main', '勝負 — DISPUTA DECISIVA', 'accent', 200),
  ]
}

function field(label: string, value: string, tone: BootTone = 'ok'): BootLine {
  const dots = '.'.repeat(Math.max(2, LABEL_COLUMN - [...label].length))
  return line('main', `> ${label} ${dots} ${value}`, tone, 74)
}

function telemetry(text: string): BootLine {
  return line('telemetry', text, 'ok', 52)
}

function uplink(text: string): BootLine {
  return line('uplink', `> ${text}`, 'ok', 64)
}

function line(channel: BootChannel, text: string, tone: BootTone, delayMs: number): BootLine {
  return { channel, text, tone, delayMs }
}
