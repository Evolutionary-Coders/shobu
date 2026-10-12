/**
 * A escolha da voz de um som posicional, num pool de tamanho fixo. Cada voz é
 * uma corrente de nós montada uma vez (`webAudioSpatial.ts`); o som novo pega
 * a primeira livre e, sem nenhuma, rouba a que começou há mais tempo — é a
 * que o ouvido já está deixando de notar, e o tiro de agora importa mais que
 * o fim do ferrolho de dois segundos atrás.
 *
 * O teto de vozes é o que segura o custo de áudio no celular: três bots
 * atirando juntos não viram trinta nós tocando.
 */
export interface VoiceSlot {
  /** No relógio do `AudioContext`: quando o som desta voz termina. */
  busyUntilS: number
  /** Quando ele começou, para o roubo escolher o mais velho. */
  startedAtS: number
}

/**
 * O índice da voz para um som que começa em `nowS`.
 *
 * ```ts
 * const index = pickVoice(slots, context.currentTime)
 * ```
 */
export function pickVoice(slots: readonly VoiceSlot[], nowS: number): number {
  if (slots.length === 0) {
    throw new RangeError('pickVoice recebeu slots []; esperado ao menos uma voz no pool')
  }
  let oldest = 0
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index] as VoiceSlot
    if (slot.busyUntilS <= nowS) return index
    if (slot.startedAtS < (slots[oldest] as VoiceSlot).startedAtS) oldest = index
  }
  return oldest
}

/**
 * Até quando a voz fica ocupada: do início agendado ao fim do trecho tocado,
 * na velocidade pedida.
 *
 * ```ts
 * busyUntil(context.currentTime, 0.3, buffer.duration, 0.9, 1)
 * ```
 */
export function busyUntil(
  nowS: number,
  delayS: number,
  durationS: number,
  offsetS: number,
  rate: number,
): number {
  return nowS + delayS + Math.max(0, durationS - offsetS) / rate
}
