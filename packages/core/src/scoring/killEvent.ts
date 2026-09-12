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
 * **O que este evento não carrega, e não pode carregar hoje**: o yaw da vítima
 * e o giro acumulado do atirador, que as medalhas `pelas-costas` e
 * `360-no-scope` pediriam. Yaw fica fora da simulação de propósito (ADR 0003),
 * e um campo vazio aqui seria promessa falsa. No dia em que o yaw entrar no
 * estado de rede, ele entra aqui como mais um campo e nenhuma assinatura muda.
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
  }
}
