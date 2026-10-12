import type { GameplayConfig, MeleeWeapon } from '@shobu/core'
import type { ArenaMap } from '../arena/arenaCatalog.ts'
import type { GameAudio } from '../audio/gameAudio.ts'
import type { HumanSkinId } from '../character/humanSkins.ts'
import type { MatchRules } from '../controller/arenaSession.ts'
import type { ArenaHud } from '../hud/arenaHud.ts'
import type { PerfPanel } from '../hud/arenaHudPerf.ts'
import type { SessionMode } from '../hud/matchClock.ts'
import type { CaptionLine } from '../hud/narratorCaptionLine.ts'
import type { LatencySource } from '../instrumentation/latencySource.ts'
import type { WeaponFinish } from '../loadout/weaponFinishes.ts'
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
  /**
   * Partida ou treino, com as regras da sala (bots, nível, classe). Vale a
   * partir do próximo quadro; o padrão é partida. Hostilidade é do modo: no
   * treino os bots não atiram.
   */
  setMode(mode: SessionMode, rules: Omit<MatchRules, 'hostileBots'>, looks: ChosenLooks): void
  /**
   * Baixa e compila a lâmina de uma classe, se ainda não veio: o boot só baixa
   * a da classe guardada, e a outra é pedida quando a classe muda no menu —
   * chega antes de o jogador entrar, sem travar o primeiro golpe.
   */
  prepareMelee(weapon: MeleeWeapon): void
  enterPointerLock(): Promise<void>
  /**
   * Entra no óculos (ADR 0012): tela cheia, paisagem e a cabeça pelo
   * giroscópio. Como o ponteiro travado, só funciona dentro de um gesto, e a
   * promessa rejeita quando o navegador recusa a tela cheia.
   */
  enterHeadset(): Promise<void>
  /**
   * Entra só com o controle: sem ponteiro travado, porque o navegador não trava
   * o ponteiro por botão de gamepad. A câmera fica no analógico direito, e o
   * START volta ao menu.
   */
  enterGamepad(): Promise<void>
  /**
   * Entra pelo toque, no celular sem óculos: o chrome do android não trava o
   * ponteiro, e quem joga é a camada de toque — analógico à esquerda, mira
   * arrastando à direita, botões no arco do polegar. O botão de pausa volta ao
   * menu.
   */
  enterTouch(): Promise<void>
  /** Avisa quando o jogador ganha ou perde o controle do personagem. */
  onPlayerControlChange(listener: (inControl: boolean) => void): void
  /**
   * O quanto dos downloads pesados já chegou (arte, lightmap, arma,
   * personagem), e se todos terminaram. É o que segura a barra do boot e a
   * entrada até o jogo estar inteiro no navegador.
   */
  onLoadProgress(listener: (ratio: number, complete: boolean) => void): void
  dispose(): void
}

/** Os acabamentos da classe: o da sniper, e o da lâmina do slot de corpo a corpo. */
export interface ChosenLooks {
  readonly sniper: WeaponFinish
  readonly blade: WeaponFinish
}

export interface ArenaRendererOptions {
  readonly canvas: HTMLCanvasElement
  readonly config: GameplayConfig
  /**
   * O mapa da partida (`arenaCatalog.ts`): colisão, spawns, área de jogo, grafo
   * dos bots, arte e atmosfera. Trocar de mapa é trocar este registro.
   */
  readonly arena: ArenaMap
  /** Onde o jogador nasce, na convenção de olho. Um dos `arena.spawnPointsM`. */
  readonly spawnPointM: readonly [number, number, number]
  /**
   * A skin que o jogador escolheu na EDITAR CLASSE. Vale para a cena montada:
   * os bots se vestem das outras (`botSkinsFor`), e trocar de skin no menu só
   * chega à sala na próxima carga da página.
   */
  readonly playerSkin: HumanSkinId
  /** A lâmina da classe guardada: a única que o boot baixa (`prepareMelee`). */
  readonly meleeWeapon: MeleeWeapon
  /**
   * O visor de combate. Injetado porque quem sabe *quando* algo mudou é o
   * renderer, e quem sabe *como* desenhar é o hud, que é dom e css (ADR 0001).
   * Sem ele o jogo roda: a luneta muda o fov e esconde a arma, sem tela.
   */
  readonly hud?: ArenaHud
  /** O bloco de FPS e ping do hud; sem ele, o medidor roda e ninguém mostra. */
  readonly perfPanel?: PerfPanel
  /** De onde vem o ping. Sem servidor, a fonte nula (`PING --`). */
  readonly latency?: LatencySource
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
   * A linha de legenda do narrador no dom (`narratorCaptionLine.ts`). Sem ela,
   * a legenda só aparece no visor do óculos.
   */
  readonly captions?: CaptionLine
  /**
   * O voto do fim de partida escolheu outro mapa. A cena sobe um mapa só, e
   * quem troca é a raiz (`main.ts`), recarregando a página com o pedido. Sem
   * ela, a partida seguinte fica no mapa de agora.
   */
  readonly onArenaSwitch?: (arenaId: string) => void
}
