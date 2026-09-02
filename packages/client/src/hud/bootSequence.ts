/**
 * O roteiro do boot de terminal. É dado puro, e é **texto autoral**: a exigência
 * de espelhar `config/gameplay.json` caiu, então o roteiro não lê mais número
 * de gameplay. A única coordenada em tela está lá porque soa como ordem de
 * ataque — e porque é o endereço real da feira.
 *
 * A ficção que organiza a tela: uma transmissão pirata invadindo um canal para
 * te ligar na arena. O trilho esquerdo é o hardware do corpo inicializando, o
 * direito é a invasão e o que ela encontrou. Cada instrumento em
 * `bootInstruments.css` é o mostrador de uma destas linhas.
 *
 * Cada linha carrega a região de tela em que sai. As três correm na mesma
 * linha do tempo, então a tela enche pela composição inteira em vez de rolar
 * um bloco só. O formato rótulo/pontilhado/valor é a espinha tipográfica da
 * tela e só quebra duas vezes, na abertura e no fecho, de propósito: são os
 * dois apoios de livro, e tudo entre eles é coluna. Todas usam o mesmo formato rótulo/pontilhado/valor — a
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
 * const lines = buildBootSequence()
 * lines[0].channel // 'telemetry'
 * ```
 */
export function buildBootSequence(): readonly BootLine[] {
  return [
    ...openingLines(),
    ...telemetryLines(),
    ...briefLines(),
    ...uplinkLines(),
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
  return [line('telemetry', 'アクセス許可 // CANAL PIRATA', 'accent', 240)]
}

/**
 * O trilho esquerdo é a máquina se inicializando peça por peça: córtex, nervo
 * óptico, barramento, blindagem, marca-passo. Telemetria vital de um corpo que
 * é metade hardware — e o firmware é pirata, a memória é alugada e a chave está
 * quebrada, porque nada aqui é legítimo. Fecha quente em VIDA.
 */
function telemetryLines(): readonly BootLine[] {
  return [
    telemetry('CORTEX', 'SYN-7 / ONLINE'),
    telemetry('NERVO', 'ÓPTICO 4.2 / LIGADO'),
    telemetry('RETINA', 'CALIBRADA'),
    telemetry('ESPINHA', 'BARRAMENTO ABERTO'),
    telemetry('DERME', 'BLINDAGEM MK-III'),
    telemetry('SANGUE', 'SINTÉTICO / 98%'),
    telemetry('CORAÇÃO', 'MARCA-PASSO ATIVO'),
    telemetry('ADRENALINA', 'INJETADA'),
    telemetry('MEMÓRIA', '12 TB / ALUGADA'),
    field('telemetry', 'FIRMWARE', 'v9.4.1 / PIRATA', 'dim', 32),
    field('telemetry', 'CHAVE', 'QUEBRADA / ACEITA', 'dim', 32),
    field('telemetry', 'VIDA', 'UMA', 'system', 32),
  ]
}

/**
 * O trilho direito de cima é a invasão: onde o nó está, como é a arena, e a
 * escalada por cima da segurança até o canal não licenciado. A ordem importa —
 * o radar acende no NÓ e o corte da arena acende no ARENA.
 */
function briefLines(): readonly BootLine[] {
  return [
    // florianópolis, onde é a feira. o radar do trilho aponta nesta coordenada.
    brief('NÓ', '-27.59 -48.55'),
    brief('ARENA', 'BECOS / PONTES / CÉU'),
    brief('INTRUSÃO', 'EM CURSO'),
    brief('FIREWALL', 'CONTORNADO'),
    brief('ICE', 'NEGRO / DESVIADO'),
    brief('RASTRO', 'APAGADO'),
    brief('CANAL', '13 / NÃO LICENCIADO'),
  ]
}

/** A parte de baixo é ameaça e alerta, e fecha como transmissão confidencial. */
function uplinkLines(): readonly BootLine[] {
  return [
    uplink('AMEAÇA', '7 ASSINATURAS'),
    uplink('ALERTA', 'CAÇADORES NA REDE'),
    uplink('SINAL', 'ROUBADO'),
    uplink('PIEDADE', 'DESLIGADA'),
    uplink('PERDÃO', 'FORA DO ESCOPO'),
    uplink('TRANSMISSÃO', 'CONFIDENCIAL'),
  ]
}

function closingLines(): readonly BootLine[] {
  return [line('uplink', 'BOA CAÇADA // 勝負', 'system', 160)]
}

function telemetry(label: string, value: string): BootLine {
  return field('telemetry', label, value, 'ok', 32)
}

function brief(label: string, value: string): BootLine {
  return field('brief', label, value, 'ok', 40)
}

function uplink(label: string, value: string): BootLine {
  return field('uplink', label, value, 'dim', 34)
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
