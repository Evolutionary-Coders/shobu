/**
 * O primeiro controle conectado é o do jogador. Laço por índice, e não `find`:
 * quem chama lê o controle por quadro, e o `find` montava uma closure a cada um.
 *
 * ```ts
 * firstConnectedPad(navigator.getGamepads?.()) // o Gamepad, ou undefined
 * ```
 */
export function firstConnectedPad<Pad extends { readonly connected: boolean }>(
  pads: ArrayLike<Pad | null> | undefined,
): Pad | undefined {
  if (!pads) return undefined
  for (let index = 0; index < pads.length; index += 1) {
    const pad = pads[index]
    if (pad?.connected) return pad
  }
  return undefined
}
