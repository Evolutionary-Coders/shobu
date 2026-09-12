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

export function boltCycleMs(config: GameplayConfig): number {
  return Math.round(config.weapon.boltCycleS * 1000)
}

export function reloadMs(config: GameplayConfig): number {
  return Math.round(config.weapon.reloadS * 1000)
}
