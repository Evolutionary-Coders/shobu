/**
 * **O que cada caixa da arena para**, em três bits: o corpo, o tiro e o
 * gancho. Até 12/10 toda caixa parava tudo, e o que não devia parar tudo
 * simplesmente não era caixa: a lanterna do Ichiban-gai e o letreiro do
 * Neon-kaidō eram arte sem colisão, e a parede invisível do fim do bairro
 * prendia a corda no ar (ADR 0024).
 *
 * Bit e não lista de nomes: o teste é um `&` dentro dos laços quentes da
 * varredura e do raio, sem alocação e sem ramo a mais que o `continue`.
 */

/** O corpo do jogador e do bot não atravessa: varredura, chão, teto de quem levanta. */
export const STOPS_BODY = 1
/** O tiro, o feixe do laser, o golpe corpo a corpo e a linha de visão do bot param aqui. */
export const STOPS_SHOT = 2
/** O gancho engata aqui. */
export const STOPS_GRAPPLE = 4

/** Parede, piso, prédio, platibanda: para tudo. É o padrão de toda caixa. */
export const COLLIDER_SOLID = STOPS_BODY | STOPS_SHOT | STOPS_GRAPPLE
/**
 * Só o corpo: a parede invisível do fim do bairro. O que não se vê não pode
 * segurar a bala nem a corda — senão o gancho prende no ar.
 */
export const COLLIDER_BODY_ONLY = STOPS_BODY
/** Só o gancho: lanterna, cabo. O corpo e a bala passam, a corda prende. */
export const COLLIDER_GRAPPLE_ONLY = STOPS_GRAPPLE
/**
 * Tiro e gancho, e o corpo passa: letreiro e telão, opacos e acima da cabeça.
 * O que o olho vê tapar é o que tapa a bala (ADR 0010); quem passa por baixo
 * não esbarra.
 */
export const COLLIDER_SHOT_AND_GRAPPLE = STOPS_SHOT | STOPS_GRAPPLE

/**
 * ```ts
 * stopsAny(COLLIDER_GRAPPLE_ONLY, STOPS_BODY) // false
 * ```
 */
export function stopsAny(colliderMask: number, query: number): boolean {
  return (colliderMask & query) !== 0
}
