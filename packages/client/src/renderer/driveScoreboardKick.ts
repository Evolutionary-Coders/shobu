import type { Scene } from '@babylonjs/core/scene.js'
import type { ArenaHud } from '../hud/arenaHud.ts'
import type { ScoreboardRow } from '../hud/scoreboardRows.ts'
import { isKickableRow, pickKickRow } from '../hud/scoreboardSelection.ts'
import type { NetworkPort } from '../net/networkPort.ts'

/** O que a escolha do tab lê e para quem escreve. */
export interface ScoreboardKickParts {
  readonly network: Pick<NetworkPort, 'connected' | 'startKickVote'>
  /** As linhas que o placar mostra (`watchScoreboardRows`). */
  rows(): readonly ScoreboardRow[]
  readonly keys: { readonly scoreboard: boolean }
  readonly canvas: HTMLCanvasElement
  readonly hud: Pick<ArenaHud, 'setScoreboardKick'>
}

/**
 * A escolha de quem expulsar no placar (ADR 0034), como no call of duty: com
 * o TAB preso, a roda anda pelas linhas de outros humanos e o K abre o voto
 * contra a escolhida. A roda, nesse meio tempo, não volta à sniper
 * (`trackHeldButtons`). A dica só aparece online e com alguém para votar.
 *
 * ```ts
 * if (options.network) driveScoreboardKick(scene, { network, rows: watched.rows, keys, canvas, hud })
 * ```
 */
export function driveScoreboardKick(scene: Scene, parts: ScoreboardKickParts): void {
  const pick = { selected: undefined as string | undefined, steps: 0, shown: '' }
  parts.canvas.addEventListener(
    'wheel',
    (event) => {
      if (parts.keys.scoreboard) pick.steps += Math.sign(event.deltaY)
    },
    { passive: true },
  )
  parts.canvas.ownerDocument.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyK' || event.repeat || !parts.keys.scoreboard) return
    if (pick.selected) parts.network.startKickVote(pick.selected)
  })
  scene.onBeforeRenderObservable.add(() => writePick(parts, pick))
}

function writePick(
  parts: ScoreboardKickParts,
  pick: { selected: string | undefined; steps: number; shown: string },
): void {
  const rows = parts.rows()
  pick.selected = pickKickRow(rows, pick.selected, pick.steps)
  pick.steps = 0
  const hint = parts.keys.scoreboard && parts.network.connected && rows.some(isKickableRow)
  const shown = `${pick.selected ?? ''}|${hint}`
  if (shown === pick.shown) return
  pick.shown = shown
  parts.hud.setScoreboardKick({ selected: pick.selected, hint })
}
