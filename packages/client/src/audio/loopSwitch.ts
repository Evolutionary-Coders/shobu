/**
 * Um laço que troca de som: o que ele toca agora, e qual dos pedidos de troca
 * ainda vale. Mora fora de `webAudioSpatial.ts` para a regra da troca ser
 * testada sem navegador — o adapter só sabe criar e parar a fonte.
 */
export interface LoopTrack<Source> {
  url: string | undefined
  rate: number
  source: Source | undefined
}

/** O que a troca precisa do motor de áudio: baixar, começar e parar. */
export interface LoopPlayer<Buffer, Source> {
  bufferOf(url: string): Promise<Buffer>
  start(buffer: Buffer, rate: number): Source
  stop(source: Source): void
}

export function createLoopTrack<Source>(): LoopTrack<Source> {
  return { url: undefined, rate: 1, source: undefined }
}

/**
 * Troca o laço (quem chama já sabe que o pedido mudou: o mesmo pedido de
 * sempre não mexe no laço, e é o que permite chamar por quadro sem picotar a
 * passada). A marca entra antes do `await`: duas trocas no mesmo quadro não
 * deixam dois laços tocando.
 *
 * ```ts
 * void switchLoop(track, footstepUrl, 1.2, player)
 * ```
 */
export async function switchLoop<Buffer, Source>(
  track: LoopTrack<Source>,
  url: string | undefined,
  rate: number,
  player: LoopPlayer<Buffer, Source>,
): Promise<void> {
  if (track.source !== undefined) player.stop(track.source)
  track.url = url
  track.rate = rate
  track.source = undefined
  if (!url) return
  const buffer = await player.bufferOf(url)
  if (track.url !== url || track.rate !== rate) return
  track.source = player.start(buffer, rate)
}
