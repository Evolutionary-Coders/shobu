import type { WeaponConfig } from '@shobu/core'
import type { SfxName } from './soundCatalog.ts'

/**
 * Quando cada som sai, e de que ponto do arquivo.
 *
 * **Os instantes abaixo foram medidos**, num envelope de energia a cada 20 ms
 * sobre o wav de origem — não estimados de ouvido. Eles são propriedade do
 * arquivo; os atrasos saem deles mais a configuração da arma, para afinar
 * `boltCycleS` ou `reloadS` não desalinhar o som (ADR 0005).
 *
 * ```ts
 * boltCue(config.weapon) // { name: 'shot-reload', offsetS: 0.9, delayS: 0.3 }
 * ```
 */
export interface SoundCue {
  readonly name: SfxName
  /** Segundos a esperar depois do evento. */
  readonly delayS: number
  /** De que ponto do arquivo começar. */
  readonly offsetS: number
}

/**
 * `shot-reload` é tiro **e** ferrolho no mesmo take: o tiro em 0,1 s e os
 * cliques do ferrolho de 0,9 s a 1,6 s. Tocar o arquivo inteiro no disparo
 * punha o último clique 0,3 s depois de o ferrolho já ter fechado, porque
 * `boltCycleS` é 1,3 s. O tiro passa a sair do `shot-sniper`, que é seco, e
 * daqui sai só o pedaço do ferrolho.
 */
const BOLT_STARTS_S = 0.9
const BOLT_LASTS_S = 0.7

/** O pico de `reload`: é o carregador entrando. */
const INSERT_AT_S = 1.02

/**
 * Em que ponto da recarga o carregador entra na arma. Sete décimos é o gesto:
 * tirar e encaixar ocupam a maior parte dela, e a batida final fecha.
 */
const INSERT_AT_RATIO = 0.7

/** O que soa na hora, sem recorte: o tiro, a luneta, a aterrissagem. */
export function nowCue(name: SfxName): SoundCue {
  return { name, delayS: 0, offsetS: 0 }
}

/** Centrado na janela do ferrolho: sobra o mesmo tanto antes e depois. */
export function boltCue(config: WeaponConfig): SoundCue {
  return {
    name: 'shot-reload',
    offsetS: BOLT_STARTS_S,
    delayS: Math.max(0, (config.boltCycleS - BOLT_LASTS_S) / 2),
  }
}

/**
 * Sem o atraso, o som de encaixar o carregador saía com ele ainda saindo da
 * arma: o arquivo tem 1,39 s e a recarga, 2,4 s.
 */
export function reloadCue(config: WeaponConfig): SoundCue {
  return {
    name: 'reload',
    offsetS: 0,
    delayS: Math.max(0, config.reloadS * INSERT_AT_RATIO - INSERT_AT_S),
  }
}
