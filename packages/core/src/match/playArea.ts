import type { Vector3 } from '../math/vector3.ts'

/**
 * A área de jogo: um retângulo no plano do chão, em metros, com x de oeste para
 * leste e z de sul para norte. A arena deixou de ser fechada por paredes — a
 * cidade continua em volta —, e é este retângulo, e não a geometria, que diz
 * até onde a partida vai.
 *
 * Em princípio só o plano xz: quem sobe num telhado dentro do retângulo
 * continua jogando, e quem cai da borda sai pelo lado, não por baixo.
 *
 * `maxFeetY` é o teto, opcional: o mapa de torres (Neon-kaidō) tem paredão de
 * 34 a 46 m **dentro** do retângulo, e o gancho de 45 m alcança o topo deles.
 * Um telhado de torre seria uma quarta camada que vê o mapa inteiro; com o
 * teto, ele vale o mesmo que sair pelo lado — a contagem de cinco segundos da
 * ADR 0011, e não uma parede invisível.
 */
export interface PlayArea {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
  readonly maxFeetY?: number
}

/**
 * Quanto tempo o jogador já passou fora da área. Mutável e reaproveitado pelo
 * mesmo motivo do `CharacterState`: um relógio novo por tick seria alocação no
 * caminho quente.
 */
export interface BoundaryClock {
  outsideS: number
}

/**
 * O que o tick decidiu: `inside` é jogo normal, `warning` é a contagem na tela,
 * `expired` é o prazo vencido — o jogador morre e reaparece num spawn.
 */
export type BoundaryStatus = 'inside' | 'warning' | 'expired'

/**
 * ```ts
 * const clock = createBoundaryClock()
 * ```
 */
export function createBoundaryClock(): BoundaryClock {
  return { outsideS: 0 }
}

/**
 * A borda conta como dentro: é a linha que o jogador vê no chão, e pisar nela
 * não pode abrir contagem.
 *
 * ```ts
 * isInsidePlayArea({ minX: -24, maxX: 24, minZ: -30, maxZ: 30 }, { x: 24, y: 0, z: 0 }) // true
 * ```
 */
export function isInsidePlayArea(area: Readonly<PlayArea>, feetM: Readonly<Vector3>): boolean {
  if (area.maxFeetY !== undefined && feetM.y > area.maxFeetY) return false
  return (
    feetM.x >= area.minX && feetM.x <= area.maxX && feetM.z >= area.minZ && feetM.z <= area.maxZ
  )
}

/**
 * Um tick do limite do mapa. Dentro zera o relógio; fora soma `dtS`; ao atingir
 * `graceS` devolve `expired` e zera, para quem reaparece não herdar uma
 * contagem já vencida.
 *
 * **Voltar zera, não pausa.** Sair e voltar em seguida devolve os cinco
 * segundos inteiros: o aviso é para quem se perdeu, não um recurso que se gasta
 * encostando na borda.
 *
 * ```ts
 * const status = stepBoundary(clock, area, character.current.position, dtS, graceS)
 * if (status === 'expired') character.respawnAt(spawnFeetM)
 * ```
 *
 * @throws RangeError área degenerada, `dtS` negativo ou `graceS` não positivo
 */
export function stepBoundary(
  clock: BoundaryClock,
  area: Readonly<PlayArea>,
  feetM: Readonly<Vector3>,
  dtS: number,
  graceS: number,
): BoundaryStatus {
  assertPlayArea(area)
  assertBoundaryTimes(dtS, graceS)
  if (isInsidePlayArea(area, feetM)) {
    clock.outsideS = 0
    return 'inside'
  }
  clock.outsideS += dtS
  if (clock.outsideS < graceS) return 'warning'
  clock.outsideS = 0
  return 'expired'
}

/**
 * Quanto falta para o prazo vencer, nunca negativo. É o número que o aviso da
 * tela mostra.
 *
 * ```ts
 * boundaryRemainingS({ outsideS: 1.5 }, 5) // 3.5
 * ```
 */
export function boundaryRemainingS(clock: Readonly<BoundaryClock>, graceS: number): number {
  return Math.max(0, graceS - clock.outsideS)
}

/**
 * `!(min < max)` e não `min >= max`: é a forma que também recusa `NaN`, que em
 * qualquer comparação dá falso e passaria em silêncio pela outra.
 */
function assertPlayArea(area: Readonly<PlayArea>): void {
  if (!(area.minX < area.maxX) || !(area.minZ < area.maxZ)) {
    const found = `minX ${area.minX}, maxX ${area.maxX}, minZ ${area.minZ}, maxZ ${area.maxZ}`
    throw new RangeError(`PlayArea recebeu ${found}; esperado minX < maxX e minZ < maxZ`)
  }
}

function assertBoundaryTimes(dtS: number, graceS: number): void {
  if (!(dtS >= 0) || !Number.isFinite(dtS)) {
    throw new RangeError(`dtS recebeu ${dtS}; esperado número finito >= 0`)
  }
  if (!(graceS > 0) || !Number.isFinite(graceS)) {
    throw new RangeError(`graceS recebeu ${graceS}; esperado número finito > 0`)
  }
}
