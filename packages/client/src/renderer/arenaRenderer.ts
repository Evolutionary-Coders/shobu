import type { GameplayConfig, GreyboxBlock } from '@shobu/core'
import type { GameAudio } from '../audio/gameAudio.ts'
import type { VoiceStage } from '../audio/spatialVoice.ts'
import type { ArenaHud } from '../hud/arenaHud.ts'
import type { SessionMode } from '../hud/matchClock.ts'
import type { NetworkPort } from '../net/networkPort.ts'
import type { LivePlayerSettings } from '../settings/livePlayerSettings.ts'

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
  /** Partida ou treino. Vale a partir do próximo quadro; o padrão é partida. */
  setMode(mode: SessionMode): void
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
  /**
   * O visor de combate. Injetado porque quem sabe *quando* algo mudou é o
   * renderer, e quem sabe *como* desenhar é o hud, que é dom e css (ADR 0001).
   * Sem ele o jogo roda: a luneta muda o fov e esconde a arma, sem tela.
   */
  readonly hud?: ArenaHud
  /**
   * Os números que o jogador controla. **Obrigatório**, ao contrário do `hud`:
   * a cena é montada em `createArenaScene`, antes de qualquer valor padrão que o
   * corpo do adapter pudesse calcular, e um padrão resolvido depois chegaria
   * tarde. Quem monta é o `main.ts`, que já é a raiz de composição.
   *
   * É um objeto **vivo e de longa duração**: a lente lê o `camera` dele todo
   * quadro, então montar um literal aqui alocaria no caminho quente.
   */
  readonly settings: LivePlayerSettings
  /**
   * O áudio do jogo. Opcional pela mesma razão do `hud`: sem ele o jogo roda,
   * mudo. Quem decide *quando* cada som toca é o `driveArenaAudio.ts`, que lê
   * a mesma sessão que o visor.
   */
  readonly audio?: GameAudio
  /**
   * O canal de jogo. Opcional pela mesma razão do `hud`: sem ele o jogo roda
   * sozinho, contra os bonecos. Com ele, o input de cada tick vai para a sala
   * e os outros jogadores aparecem na arena.
   */
  readonly network?: NetworkPort
  /**
   * Onde cada voz soa, pela câmera e pela posição de quem fala (ADR 0026).
   * Opcional: sem servidor de mídia, ninguém fala.
   */
  readonly voice?: VoiceStage
}
