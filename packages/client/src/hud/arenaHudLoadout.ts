import type { GameplayConfig, WeaponPhase } from '@shobu/core'
import { ammoPipStates } from './ammoPips.ts'
import { mountArenaHudLayer } from './arenaHudLayer.ts'
import { grappleReadout } from './grappleReadout.ts'
import { createGlyphLabel, type GlyphLabel, writeThinBar } from './hudComponentsDom.ts'
import type { GlyphSheet } from './hudGlyphText.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'
import { ammoLabels, WEAPON_DESIGNATION, weaponStatus } from './visorFields.ts'

/**
 * O bloco de arma, no canto inferior direito: o `LQ-84i 33.2%` do Metal Gear
 * Rising. Designação técnica pequena, munição grande em glifo com o pente
 * menor ao lado, uma marca fina por bala e a barra amarela do ferrolho.
 *
 * A barra não recebe número nenhum: ela enche por animação de css, com as
 * durações que o `arenaHud.ts` escreve do config (`--bolt-cycle`,
 * `--reload-time`), e quem a dispara é o `data-weapon`.
 */
export interface WeaponPanel {
  /** Munição carregada e o que a arma está fazendo. Por evento, nunca por quadro. */
  setAmmo(loaded: number, phase: WeaponPhase): void
}

export interface WeaponPanelOptions {
  readonly root: ElementQuery
  readonly sheet: GlyphSheet
  readonly config: GameplayConfig
}

const AMMO_HEIGHT_PX = 46
const MAGAZINE_HEIGHT_PX = 18
const GRAPPLE_HEIGHT_PX = 14

/**
 * ```ts
 * const weapon = createWeaponPanel({ root: document, sheet, config })
 * weapon.setAmmo(5, 'ready')
 * ```
 */
export function createWeaponPanel(options: WeaponPanelOptions): WeaponPanel {
  const magazineRounds = options.config.weapon.magazineRounds
  const view = weaponView(options)
  return {
    setAmmo: (loaded, phase) => {
      // `ammoPipStates` valida a faixa; o css desenha cada estado.
      ammoPipStates(loaded, magazineRounds, phase).forEach((pipState, index) => {
        view.pips[index]?.setAttribute('data-pip', pipState)
      })
      view.hud.dataset.weapon = phase
      view.hud.dataset.ammo = `${loaded}`
      view.status.textContent = weaponStatus(loaded, phase)
      const labels = ammoLabels(loaded, magazineRounds)
      view.ammo.write(labels.loaded)
      view.magazine.write(labels.magazine)
    },
  }
}

interface WeaponView {
  readonly hud: HTMLElement
  readonly status: HTMLElement
  readonly ammo: GlyphLabel
  readonly magazine: GlyphLabel
  readonly pips: readonly HTMLElement[]
}

/** Monta os mostradores do bloco. A designação é escrita aqui, uma vez: a arma é uma só. */
function weaponView(options: WeaponPanelOptions): WeaponView {
  const { root, sheet } = options
  const label = (selector: string, heightPx: number): GlyphLabel =>
    createGlyphLabel(requireElement(root, selector), { sheet, heightPx })
  requireElement<HTMLElement>(root, '#hud-weapon-name').textContent = WEAPON_DESIGNATION
  return {
    hud: requireElement<HTMLElement>(root, '#arena-hud'),
    status: requireElement<HTMLElement>(root, '#hud-weapon-status'),
    ammo: label('#hud-ammo', AMMO_HEIGHT_PX),
    magazine: label('#hud-magazine', MAGAZINE_HEIGHT_PX),
    pips: mountArenaHudLayer(root, { pipCount: options.config.weapon.magazineRounds }).pips,
  }
}

/**
 * O gancho, logo abaixo da arma: rótulo, `PRONTO` ou os segundos que faltam
 * em glifo, e uma barra branca fina que enche durante a recarga.
 */
export interface GrapplePanel {
  /** Segundos de recarga restantes; 0 é pronto. */
  setGrapple(remainingS: number): void
}

/**
 * ```ts
 * const grapple = createGrapplePanel({ root: document, sheet, config })
 * grapple.setGrapple(0)
 * ```
 */
export function createGrapplePanel(options: WeaponPanelOptions): GrapplePanel {
  const { root, sheet } = options
  const cooldownS = options.config.grapple.cooldownS
  const hud = requireElement<HTMLElement>(root, '#arena-hud')
  const bar = requireElement<HTMLElement>(root, '#hud-grapple-bar')
  const value = createGlyphLabel(requireElement(root, '#hud-grapple-value'), {
    sheet,
    heightPx: GRAPPLE_HEIGHT_PX,
  })
  return {
    setGrapple: (remainingS) => {
      const readout = grappleReadout(remainingS, cooldownS)
      hud.dataset.grapple = readout.state
      value.write(readout.label)
      writeThinBar(bar, readout.charge)
    },
  }
}
