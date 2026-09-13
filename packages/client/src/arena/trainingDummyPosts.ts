import { GREYBOX_SPAWN_POINTS_M } from './greyboxBlockout.ts'

/**
 * Onde os bonecos de treino ficam, na convenção de **olho** dos
 * `GREYBOX_SPAWN_POINTS_M`.
 *
 * Cinco dos seis postes são pontos de spawn, **referenciados por índice e não
 * copiados**: mover um spawn no level design move o boneco junto, em vez de
 * deixar duas coordenadas divergirem em silêncio.
 *
 * O sexto é o posto de revisão, a 8,5 m do spawn 0, e existe porque **nenhum
 * par de spawns fica perto**: a dispersão que defende contra camping de spawn
 * (pilar 1) deixaria o campo de treino sem alvo nenhum na faixa de domínio do
 * no scope. Sem ele não dá para sentir a arma de perto.
 *
 * A ordem é por distância crescente do spawn 0, atravessando as três faixas
 * que o modelo de simulação exige — domínio do no scope, faixa de decisão,
 * domínio da mira — sem faixa órfã.
 */
const REVIEW_POST_M: readonly [number, number, number] = [20, 2, 20]

/** Índices em `GREYBOX_SPAWN_POINTS_M`, do mais perto do spawn 0 ao mais longe. */
export const TRAINING_DUMMY_SPAWN_INDEXES: readonly number[] = [6, 8, 10, 4, 1]

/**
 * ```ts
 * trainingDummyPostsM(2) // [[20, 2, 20], [20, 9.5, 8]]
 * ```
 */
export function trainingDummyPostsM(count: number): readonly (readonly [number, number, number])[] {
  const posts = [REVIEW_POST_M, ...spawnPosts()]
  if (!Number.isInteger(count) || count < 0 || count > posts.length) {
    throw new RangeError(`count recebeu ${count}; esperado inteiro de 0 a ${posts.length}`)
  }
  return posts.slice(0, count)
}

/**
 * Percorre os spawns e guarda os escolhidos **na ordem de
 * `TRAINING_DUMMY_SPAWN_INDEXES`**, que é por distância crescente e não por
 * número de spawn.
 *
 * Varredura em vez de indexar um a um porque indexar devolve
 * `| undefined` e pede uma guarda que nenhum teste alcança: os índices são
 * constantes, então "todo índice existe" é fato estático, e fato estático é
 * vigiado por teste, não por `throw` em tempo de execução — ver
 * `trainingDummyPosts.test.ts`.
 */
function spawnPosts(): readonly (readonly [number, number, number])[] {
  const posts: (readonly [number, number, number])[] = []
  let index = -1
  for (const spawn of GREYBOX_SPAWN_POINTS_M) {
    index += 1
    const slot = TRAINING_DUMMY_SPAWN_INDEXES.indexOf(index)
    if (slot >= 0) posts[slot] = spawn
  }
  return posts
}
