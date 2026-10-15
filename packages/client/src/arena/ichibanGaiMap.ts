/**
 * O Ichiban-gai como entrada do catálogo (`arenaCatalog.ts`): o layout do
 * núcleo (`ICHIBAN_GAI_LAYOUT`), a arte de `npm run build:arena-art -- ichiban-gai`
 * e a hora azul de `daySky.ts`.
 */
import { ICHIBAN_GAI_LAYOUT } from '@shobu/core'
import { arenaLightingSpec } from '../renderer/arenaLightingSpec.ts'
import type { ArenaMap } from './arenaCatalog.ts'
import { arenaFogSpec } from './arenaFogSpec.ts'
import { daySkySpec } from './daySky.ts'

export const ICHIBAN_GAI_MAP: ArenaMap = {
  ...ICHIBAN_GAI_LAYOUT,
  displayName: 'Ichiban-gai',
  sceneryManifest: 'ichiban-gai.json',
  atmosphere: () => ({ sky: daySkySpec(), fog: arenaFogSpec(), lighting: arenaLightingSpec() }),
}
