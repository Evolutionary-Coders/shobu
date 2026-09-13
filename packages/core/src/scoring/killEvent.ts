/**
 * Uma kill, com tudo que a resolução de acerto sabia **no instante do
 * disparo**. A lista de campos é a coluna "o que a simulação tem que
 * reconhecer" do modelo de simulação: cada medalha da proposta é uma função
 * pura sobre este evento mais o placar, e nenhuma delas precisa de estado novo
 * caro.
 *
 * Os ids são opacos de propósito: hoje é `dummy-3` e `local`, amanhã é o
 * `sessionId` do colyseus, e nada aqui muda (ADR 0002).
 *
 * **Os campos que existem sem ter o que medir ainda.** `shooterYawTurnDeg`,
 * `victimFacingAwayDeg` e `victimsInShot` ficam no valor neutro porque a
 * mecânica que os preencheria não existe: yaw está fora da simulação por
 * decisão (ADR 0003), e o hitscan para na primeira vítima. Eles entram assim
 * mesmo, e a troca é deliberada — a regra de `360-no-scope`, `backstab` e
 * `collateral` existe, tem teste de mesa, e acende sozinha no dia em que a
 * mecânica chegar. O contrário, deixar a regra de fora, é o que obrigaria a
 * mexer em quatro arquivos naquele dia.
 *
 * Cada um deles traz, no próprio comentário, **qual mecânica o destrava** —
 * senão campo parado vira campo esquecido.
 */
export type KillWeapon = 'sniper' | 'knife'

export interface KillEvent {
  readonly shooterId: string
  readonly victimId: string
  /** Segundos desde o começo da partida. Nunca `Date.now()` (ADR 0003). */
  readonly atS: number
  readonly weapon: KillWeapon
  /** Mira telescópica no instante do disparo — é a `no-scope`. */
  readonly scoped: boolean
  /** Distância no instante do disparo — é o `tiro-longo`. */
  readonly distanceM: number
  /** Atirador sem contato com o chão — é o `aereo`. */
  readonly shooterAirborne: boolean
  /** Vítima sem contato com o chão — é o `pombo`. */
  readonly victimAirborne: boolean
  /** Atirador com o gancho engatado — é a `na-corda`. */
  readonly shooterGrappling: boolean
  /**
   * Altura do acerto na cápsula da vítima, de 0 no pé a 1 no topo — é o
   * `headshot`. Sai de `hitHeightRatio`, sem cápsula de cabeça e sem mudar o
   * rewind.
   */
  readonly hitHeightRatio: number
  /**
   * Graus de guinada que o atirador acumulou nos segundos antes do tiro — é o
   * `360-no-scope`. **Destrava quando o yaw entrar no estado de rede**
   * (ADR 0003); até lá, 0.
   */
  readonly shooterYawTurnDeg: number
  /**
   * Ângulo entre o olhar da vítima e a direção do tiro, em graus: 180° é ela
   * de costas — é o `backstab`. **Destrava com o yaw da vítima**; até lá, 0.
   */
  readonly victimFacingAwayDeg: number
  /**
   * Quantas vítimas o mesmo raio atravessou — é a `collateral`. **Destrava
   * quando o disparo penetrar corpo**; até lá, 1.
   */
  readonly victimsInShot: number
}

export type MutableKillEvent = { -readonly [Key in keyof KillEvent]: KillEvent[Key] }

/** Um evento reaproveitado: uma kill por tick, e nada aloca no caminho quente. */
export function createKillEvent(): MutableKillEvent {
  return {
    shooterId: '',
    victimId: '',
    atS: 0,
    weapon: 'sniper',
    scoped: false,
    distanceM: 0,
    shooterAirborne: false,
    victimAirborne: false,
    shooterGrappling: false,
    hitHeightRatio: 0,
    shooterYawTurnDeg: 0,
    victimFacingAwayDeg: 0,
    victimsInShot: 1,
  }
}
