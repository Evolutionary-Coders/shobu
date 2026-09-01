import { GREYBOX_BLOCKOUT, GREYBOX_SPAWN_POINTS_M } from './arena/greyboxBlockout.ts'
import { fetchGameplayConfig } from './config/fetchGameplayConfig.ts'
import { type BootOverlay, createBootOverlay } from './hud/bootOverlay.ts'
import { describeTimeToControl, timeToControlMs } from './instrumentation/timeToPlayerControl.ts'
import type { ArenaRenderer } from './renderer/arenaRenderer.ts'
import { createBabylonArenaRenderer } from './renderer/babylonArenaRenderer.ts'

/** Servido pelo `gameplayConfigPlugin` a partir de `config/gameplay.json`. */
const GAMEPLAY_CONFIG_URL = '/gameplay.json'

async function boot(): Promise<void> {
  const overlay = createBootOverlay(document)
  try {
    const renderer = await createArenaRenderer()
    reportControlTiming(renderer, overlay)
    overlay.onEnterRequested(() => {
      renderer.enterPointerLock().catch((reason: unknown) => overlay.announceFailure(reason))
    })
    renderer.start()
    overlay.announceReady()
  } catch (reason) {
    overlay.announceFailure(reason)
  }
}

async function createArenaRenderer(): Promise<ArenaRenderer> {
  const canvas = document.querySelector<HTMLCanvasElement>('#arena-canvas')
  if (!canvas) throw new Error("querySelector('#arena-canvas') não achou o canvas da arena")
  const spawnPointM = GREYBOX_SPAWN_POINTS_M[0]
  if (!spawnPointM) throw new Error('GREYBOX_SPAWN_POINTS_M está vazio; esperado 12 pontos')
  const config = await fetchGameplayConfig(GAMEPLAY_CONFIG_URL)
  return createBabylonArenaRenderer({ canvas, config, blockout: GREYBOX_BLOCKOUT, spawnPointM })
}

/**
 * `performance.now()` conta do início da navegação, então ele já é o número do
 * pilar 2 — do clique no link ao controle do personagem. Só a primeira entrada
 * conta: reentrar depois de um esc mede a troca de foco, não o carregamento.
 */
function reportControlTiming(renderer: ArenaRenderer, overlay: BootOverlay): void {
  let measured = false
  renderer.onPlayerControlChange((inControl) => {
    overlay.setInGame(inControl)
    if (!inControl || measured) return
    measured = true
    overlay.reportTimeToControl(describeTimeToControl(timeToControlMs(0, performance.now())))
  })
}

void boot()
