import type { GameplayConfig } from '@shobu/core'
import type { GreyboxBlock } from '../arena/greyboxBlockout.ts'

/**
 * A interface de render que este projeto é dono. Babylon é adapter atrás dela
 * (ADR 0001): se o peso do bundle reabrir a decisão da engine, o custo da
 * migração fica limitado ao que implementa esta interface.
 */
export interface ArenaRenderer {
  /** Começa o laço de render. Idempotente. */
  start(): void
  /**
   * Pede o ponteiro travado. Só funciona dentro de um gesto do usuário, e o
   * navegador recusa em contexto que não permite (iframe de outra origem,
   * automação). A promessa rejeita nesse caso, e quem chama tem que contar
   * isso ao jogador: overlay que não some sem explicação parece jogo travado.
   */
  enterPointerLock(): Promise<void>
  /** Avisa quando o jogador ganha ou perde o controle do personagem. */
  onPlayerControlChange(listener: (inControl: boolean) => void): void
  dispose(): void
}

export interface ArenaRendererOptions {
  readonly canvas: HTMLCanvasElement
  readonly config: GameplayConfig
  readonly blockout: readonly GreyboxBlock[]
  readonly spawnPointM: readonly [number, number, number]
}
