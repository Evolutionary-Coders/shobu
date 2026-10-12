/**
 * O Neon-kaidō como entrada do catálogo (`arenaCatalog.ts`): o layout de
 * `neonKaido.ts`, o grafo de `neonKaidoNavGraph.ts`, a arte de
 * `npm run build:arena-art -- neon-kaido` e a noite de `neonKaidoAtmosphere.ts`.
 */
import type { ArenaMap } from './arenaCatalog.ts'
import {
  NEON_KAIDO_BLOCKOUT,
  NEON_KAIDO_PLAY_AREA,
  NEON_KAIDO_SPAWN_POINTS_M,
} from './neonKaido.ts'
import { neonKaidoAtmosphere } from './neonKaidoAtmosphere.ts'
import { neonKaidoNavGraph } from './neonKaidoNavGraph.ts'

export const NEON_KAIDO_MAP: ArenaMap = {
  id: 'neon-kaido',
  displayName: 'Neon-kaidō',
  blockout: NEON_KAIDO_BLOCKOUT,
  spawnPointsM: NEON_KAIDO_SPAWN_POINTS_M,
  playArea: NEON_KAIDO_PLAY_AREA,
  navGraph: neonKaidoNavGraph,
  sceneryManifest: 'neon-kaido.json',
  atmosphere: neonKaidoAtmosphere,
}
