import type { NavGraph } from '../bots/navGraph.ts'
import type { PlayArea } from '../match/playArea.ts'
import type { GreyboxBlock, Vec3 } from './arenaBlock.ts'
import ichibanGaiArt from './artColliders/ichiban-gai.json' with { type: 'json' }
import neonKaidoArt from './artColliders/neon-kaido.json' with { type: 'json' }
import { artCollidersFrom } from './artColliders.ts'
import {
  ICHIBAN_GAI_BLOCKOUT,
  ICHIBAN_GAI_PLAY_AREA,
  ICHIBAN_GAI_SPAWN_POINTS_M,
} from './ichibanGai.ts'
import { ichibanGaiLanterns } from './ichibanGaiLanterns.ts'
import { ichibanGaiNavGraph } from './ichibanGaiNavGraph.ts'
import {
  NEON_KAIDO_BLOCKOUT,
  NEON_KAIDO_PLAY_AREA,
  NEON_KAIDO_SPAWN_POINTS_M,
} from './neonKaido.ts'
import { neonKaidoNavGraph } from './neonKaidoNavGraph.ts'
import type { PropCollider } from './propCollider.ts'

/**
 * O que de um mapa vale como regra: colisão, spawns, área de jogo e o grafo
 * dos bots. Mora no núcleo porque o servidor de jogo simula no mesmo mapa que
 * o cliente desenha (ADR 0024, "se o servidor precisar da colisão sem o json
 * do cliente"); o que é só imagem — arte, céu, névoa, luz — fica no
 * `ArenaMap` do cliente, que estende este.
 */
export interface ArenaLayout {
  /** Estável e em minúsculas: é o que se guarda, o que vai na url e o que a sala usa. */
  readonly id: string
  /** As caixas que são, ao mesmo tempo, colisão e alvo do tiro. */
  readonly blockout: readonly GreyboxBlock[]
  /**
   * A colisão do que a arte veste por cima do blockout — lanterna, letreiro,
   * platibanda —, cada peça com o que ela para (`propCollider.ts`, ADR 0024).
   */
  readonly props: readonly PropCollider[]
  /** Os spawns, na convenção de olho (`spawnFeetM` dá o pé). */
  readonly spawnPointsM: readonly Vec3[]
  /** O retângulo que a regra de fora da área vigia (ADR 0011). */
  readonly playArea: PlayArea
  /** Por onde os bots andam (ADR 0016). Função porque o grafo é montado, não constante. */
  navGraph(): NavGraph
}

export const NEON_KAIDO_LAYOUT: ArenaLayout = {
  id: 'neon-kaido',
  blockout: NEON_KAIDO_BLOCKOUT,
  props: artCollidersFrom(neonKaidoArt.colliders),
  spawnPointsM: NEON_KAIDO_SPAWN_POINTS_M,
  playArea: NEON_KAIDO_PLAY_AREA,
  navGraph: neonKaidoNavGraph,
}

export const ICHIBAN_GAI_LAYOUT: ArenaLayout = {
  id: 'ichiban-gai',
  blockout: ICHIBAN_GAI_BLOCKOUT,
  props: [...ichibanGaiLanterns(), ...artCollidersFrom(ichibanGaiArt.colliders)],
  spawnPointsM: ICHIBAN_GAI_SPAWN_POINTS_M,
  playArea: ICHIBAN_GAI_PLAY_AREA,
  navGraph: ichibanGaiNavGraph,
}
