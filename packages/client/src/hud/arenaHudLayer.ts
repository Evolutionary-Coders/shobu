import { type ElementQuery, requireElement } from './requireElement.ts'

/**
 * Monta no boot os nós que o hud desenha em quantidade: hoje, as marcas de
 * bala do bloco de arma.
 *
 * **No boot e não no primeiro tiro**, pelo mesmo motivo do `mountJackInLayer`:
 * algumas dezenas de nós são baratos, mas não no quadro em que o jogador
 * acabou de ganhar o controle.
 */
export interface ArenaHudLayerOptions {
  readonly pipCount: number
}

export interface ArenaHudLayer {
  /** Uma marca por bala do pente, na ordem de `ammoPipStates`. */
  readonly pips: readonly HTMLElement[]
}

/**
 * ```ts
 * const { pips } = mountArenaHudLayer(document, { pipCount: config.weapon.magazineRounds })
 * ```
 */
export function mountArenaHudLayer(
  root: ElementQuery,
  options: ArenaHudLayerOptions,
): ArenaHudLayer {
  const row = requireElement<HTMLElement>(root, '#hud-ammo-pips')
  const document = row.ownerDocument
  const pips = Array.from({ length: options.pipCount }, () => {
    const pip = document.createElement('span')
    pip.className = 'ammo-pip'
    pip.dataset.pip = 'loaded'
    return pip
  })
  row.replaceChildren(...pips)
  return { pips }
}
