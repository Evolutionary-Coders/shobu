/**
 * O Neon-kaidō como entrada do catálogo (`arenaCatalog.ts`): o layout do
 * núcleo (`NEON_KAIDO_LAYOUT`), a arte de `npm run build:arena-art -- neon-kaido`
 * e a noite de `neonKaidoAtmosphere.ts`.
 */
import { NEON_KAIDO_LAYOUT } from '@shobu/core'
import type { ArenaMap } from './arenaCatalog.ts'
import { neonKaidoAtmosphere } from './neonKaidoAtmosphere.ts'

export const NEON_KAIDO_MAP: ArenaMap = {
  ...NEON_KAIDO_LAYOUT,
  displayName: 'Neon-kaidō',
  sceneryManifest: 'neon-kaido.json',
  atmosphere: neonKaidoAtmosphere,
}
