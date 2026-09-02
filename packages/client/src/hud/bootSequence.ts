import type { GameplayConfig } from '@shobu/core'

/**
 * O roteiro do boot de terminal. É dado puro, montado a partir de
 * `config/gameplay.json`: os números que passam na tela são **os mesmos** que o
 * jogo vai usar no tick seguinte, não texto decorativo. Trocar o fov no json
 * troca o fov na intro, e é assim que ela não vira mentira com o tempo.
 *
 * Cada linha carrega a região de tela em que sai. As três correm na mesma
 * linha do tempo, então a tela enche pela composição inteira em vez de rolar
 * um bloco só. Todas usam o mesmo formato rótulo/pontilhado/valor — a
 * regularidade da coluna é o que faz a tela ler como instrumento em vez de
 * colagem.
 */
export type BootChannel = 'telemetry' | 'brief' | 'uplink'
export type BootTone = 'system' | 'ok' | 'dim' | 'accent'

export interface BootLine {
  readonly channel: BootChannel
  readonly text: string
  readonly tone: BootTone
  /** Pausa antes desta linha aparecer. É o ritmo da intro. */
  readonly delayMs: number
}

const LABEL_COLUMN = 13

/** Terminal vazio piscando antes de a primeira linha sair. */
export const INTRO_IDLE_BEAT_MS = 300

/** Duração da entrada do logo, casada com `logo-slam` no hud.css. */
export const INTRO_LOGO_REVEAL_MS = 560

/**
 * ```ts
 * const lines = buildBootSequence(config)
 * lines[0].channel // 'telemetry'
 * ```
 */
export function buildBootSequence(config: GameplayConfig): readonly BootLine[] {
  return [
    ...openingLines(),
    ...telemetryLines(config),
    ...briefLines(config),
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
  return [line('telemetry', 'アクセス許可 // ACCESS GRANTED', 'accent', 240)]
}

function telemetryLines(config: GameplayConfig): readonly BootLine[] {
  const { simulation, camera, collision, weapon, grapple } = config
  return [
    telemetry('RENDER', 'WEBGL2 / BABYLON 9'),
    telemetry('SYNC', `TICK ${simulation.tickHz}Hz / SNAP ${simulation.snapshotHz}Hz`),
    telemetry('ÓPTICA', `FOV ${camera.baseFovDeg}° / MIRA ${camera.scopedFovDeg}°`),
    telemetry('CHASSI', `R ${collision.capsuleRadiusM}m / H ${collision.capsuleHeightM}m`),
    telemetry('BALÍSTICA', `HITSCAN ${weapon.hitscanRangeM}m`),
    telemetry('GANCHO', `${grapple.maxRangeM}m / CD ${grapple.cooldownS}s`),
  ]
}

function briefLines(config: GameplayConfig): readonly BootLine[] {
  const { match } = config
  return [
    brief('SETOR', 'BRASIL -27.59 -48.55'),
    brief('ARENA', '3 CAMADAS / 12 SPAWNS'),
    brief('SALA', `${match.playersPerRoom} JOGADORES / ${match.durationS}s`),
    brief('RESPAWN', `${match.respawnDelayS}s`),
  ]
}

function uplinkLines(config: GameplayConfig): readonly BootLine[] {
  const substep = config.collision.subStepMaxDisplacementM
  return [
    uplink('AUTORIDADE', 'SERVIDOR'),
    uplink('PREDIÇÃO', 'CLIENTE'),
    uplink('COLISÃO', `CÁPSULA / ${substep}m`),
    uplink('TICK', 'FIXO / RNG SEMEADO'),
  ]
}

function closingLines(): readonly BootLine[] {
  return [line('uplink', 'LINK ESTÁVEL // 勝負', 'system', 200)]
}

function telemetry(label: string, value: string): BootLine {
  return field('telemetry', label, value, 'ok', 44)
}

function brief(label: string, value: string): BootLine {
  return field('brief', label, value, 'ok', 58)
}

function uplink(label: string, value: string): BootLine {
  return field('uplink', label, value, 'dim', 46)
}

/** Rótulo, pontilhado até a coluna fixa, valor. O alinhamento é o desenho. */
function field(
  channel: BootChannel,
  label: string,
  value: string,
  tone: BootTone,
  delayMs: number,
): BootLine {
  const dots = '.'.repeat(Math.max(2, LABEL_COLUMN - [...label].length))
  return line(channel, `${label} ${dots} ${value}`, tone, delayMs)
}

function line(channel: BootChannel, text: string, tone: BootTone, delayMs: number): BootLine {
  return { channel, text, tone, delayMs }
}
