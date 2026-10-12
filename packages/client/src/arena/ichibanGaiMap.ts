/**
 * O Ichiban-gai como entrada do catálogo (`arenaCatalog.ts`): o layout de
 * `ichibanGai.ts`, o grafo de `ichibanGaiNavGraph.ts`, a arte de
 * `npm run build:arena-art -- ichiban-gai` e a hora azul de `daySky.ts`.
 */
import { arenaLightingSpec } from '../renderer/arenaLightingSpec.ts'
import type { ArenaMap } from './arenaCatalog.ts'
import { arenaFogSpec } from './arenaFogSpec.ts'
import { daySkySpec } from './daySky.ts'
import {
  ICHIBAN_GAI_BLOCKOUT,
  ICHIBAN_GAI_PLAY_AREA,
  ICHIBAN_GAI_SPAWN_POINTS_M,
} from './ichibanGai.ts'
import { ichibanGaiLanterns } from './ichibanGaiLanterns.ts'
import { ichibanGaiNavGraph } from './ichibanGaiNavGraph.ts'

export const ICHIBAN_GAI_MAP: ArenaMap = {
  id: 'ichiban-gai',
  displayName: 'Ichiban-gai',
  blockout: ICHIBAN_GAI_BLOCKOUT,
  props: ichibanGaiLanterns(),
  spawnPointsM: ICHIBAN_GAI_SPAWN_POINTS_M,
  playArea: ICHIBAN_GAI_PLAY_AREA,
  navGraph: ichibanGaiNavGraph,
  sceneryManifest: 'ichiban-gai.json',
  atmosphere: () => ({ sky: daySkySpec(), fog: arenaFogSpec(), lighting: arenaLightingSpec() }),
}
