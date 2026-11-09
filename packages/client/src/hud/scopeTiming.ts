import type { GameplayConfig } from '@shobu/core'

/**
 * As durações que o css do hud tem que respeitar, lidas do
 * `config/gameplay.json` em vez de repetidas à mão no css.
 *
 * O jogador lê a luneta abrindo e o ferrolho ciclando como **informação**: se a
 * animação durar diferente do número do jogo, a tela mente. Por isso o
 * `arenaHud.ts` escreve estes valores em propriedades customizadas, e nenhum
 * número de tempo vive solto no css (ADR 0005).
 */
export function scopeOpenMs(config: GameplayConfig): number {
  return Math.round(config.camera.scopeTransitionS * 1000)
}

/**
 * Com o FERROLHO RÁPIDO (`rapidBolt`) o ferrolho e a recarga acabam no tick
 * seguinte (`WeaponState.boltFree`), e a barra enche na hora: contar o tempo
 * do config seria a tela mentindo que ainda não dá para atirar.
 *
 * ```ts
 * hud.style.setProperty('--bolt-cycle', `${boltCycleMs(config, weapon.boltFree)}ms`)
 * ```
 */
export function boltCycleMs(config: GameplayConfig, rapidBolt = false): number {
  return rapidBolt ? 0 : Math.round(config.weapon.boltCycleS * 1000)
}

/** A recarga, com a mesma regra do FERROLHO RÁPIDO de `boltCycleMs`. */
export function reloadMs(config: GameplayConfig, rapidBolt = false): number {
  return rapidBolt ? 0 : Math.round(config.weapon.reloadS * 1000)
}
