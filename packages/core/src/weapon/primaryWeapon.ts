/**
 * A arma principal da classe: qual sniper o jogador carrega. As duas jogam
 * igual (mesma config, um tiro mata, o ferrolho fica) e só mudam o modelo e o
 * feixe; por isso a escolha mora aqui como dado puro e a regra de tiro nem a lê.
 */
export type PrimaryWeapon = 'laser' | 'classic'

/** A ordem do menu, que é também o código do fio; a primeira é a padrão. */
export const PRIMARY_WEAPONS: readonly PrimaryWeapon[] = ['laser', 'classic']

/** A sniper laser: quem não escolheu nada, e todo bot, a carrega. */
export const DEFAULT_PRIMARY_WEAPON: PrimaryWeapon = 'laser'

/**
 * A arma principal como índice de `PRIMARY_WEAPONS`, o `uint8` do estado da sala.
 *
 * ```ts
 * encodePrimaryWeapon('classic') // 1
 * ```
 */
export function encodePrimaryWeapon(weapon: PrimaryWeapon): number {
  return PRIMARY_WEAPONS.indexOf(weapon)
}

/**
 * O índice do estado da sala de volta para a arma. Um código desconhecido, ou
 * `undefined` de um servidor antigo sem o campo, vira a laser em vez de
 * derrubar o cliente: errar o modelo de um rival é cosmético.
 *
 * ```ts
 * decodePrimaryWeapon(1) // 'classic'
 * decodePrimaryWeapon(7) // 'laser'
 * ```
 */
export function decodePrimaryWeapon(code: number | undefined): PrimaryWeapon {
  if (code === undefined) {
    return DEFAULT_PRIMARY_WEAPON
  }
  return PRIMARY_WEAPONS[code] ?? DEFAULT_PRIMARY_WEAPON
}

/**
 * Valida o que chega da rede antes de virar escolha do assento.
 *
 * ```ts
 * isPrimaryWeapon('laser') // true
 * isPrimaryWeapon('rocket') // false
 * ```
 */
export function isPrimaryWeapon(candidate: unknown): candidate is PrimaryWeapon {
  return PRIMARY_WEAPONS.some((weapon) => weapon === candidate)
}
