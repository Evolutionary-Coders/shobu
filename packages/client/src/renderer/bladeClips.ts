import type { MeleeWeapon } from '@shobu/core'

/**
 * Os clipes esqueléticos das lâminas em primeira pessoa, assados no blender
 * por `scripts/blender/melee_golpes.py` dentro do glb de cada lâmina: os
 * braços da sniper riggados com IK, a lâmina guiando as mãos. O nome do grupo
 * de animação no glb é `${arma}_${clipe}`.
 *
 * Esta tabela é a metade do cliente do mesmo contrato: a duração tem de bater
 * com a do glb (`clipDurationMismatches`), e o rastro e a rolagem de câmera
 * caem nos instantes que o script desenhou — o corte cruza a retícula entre
 * 90 e 120 ms, porque o acerto do núcleo é instantâneo (`stepMelee.ts`).
 */
export type BladeClip =
  | 'idle'
  | 'draw'
  | 'holster'
  | 'slash_1'
  | 'slash_2'
  | 'slash_3'
  | 'dash'
  | 'quick'
  | 'stab'
  | 'slash'

/** Um instante de uma curva escalar: entre dois, a curva é suave nas pontas. */
export interface ScalarKey {
  readonly atS: number
  readonly value: number
}

export interface BladeClipSpec {
  readonly durationS: number
  /** O descanso dá a volta; o resto toca uma vez e para no último quadro. */
  readonly loop: boolean
  /** A janela do rastro de luz da lâmina, em segundos do clipe: a fase rápida do corte. */
  readonly trail?: readonly [number, number]
  /** A rolagem da câmera, em radianos (`rotation.z`): o corpo entrando no golpe. */
  readonly roll?: readonly ScalarKey[]
}

/** O rastro acende quando o corte solta do alto e apaga quando ele passou da retícula. */
const SLASH_TRAIL: readonly [number, number] = [0.07, 0.2]

/** Rolagem de um corte que vai para a esquerda; o espelho é o que vai para a direita. */
function leaning(side: 1 | -1, peakRad: number): readonly ScalarKey[] {
  return [
    { atS: 0, value: 0 },
    { atS: 0.055, value: -0.3 * peakRad * side },
    { atS: 0.15, value: peakRad * side },
    { atS: 0.45, value: 0 },
  ]
}

const KATANA_CLIPS: Readonly<Partial<Record<BladeClip, BladeClipSpec>>> = {
  idle: { durationS: 3, loop: true },
  draw: { durationS: 0.3, loop: false },
  holster: { durationS: 0.22, loop: false },
  slash_1: { durationS: 0.45, loop: false, trail: SLASH_TRAIL, roll: leaning(1, 0.035) },
  slash_2: { durationS: 0.45, loop: false, trail: SLASH_TRAIL, roll: leaning(-1, 0.035) },
  slash_3: { durationS: 0.45, loop: false, trail: SLASH_TRAIL, roll: leaning(1, 0.025) },
  dash: { durationS: 0.4, loop: false, trail: [0.07, 0.2] },
  quick: { durationS: 0.45, loop: false, trail: [0.06, 0.25], roll: leaning(1, 0.025) },
}

const KNIFE_CLIPS: Readonly<Partial<Record<BladeClip, BladeClipSpec>>> = {
  idle: { durationS: 2.4, loop: true },
  draw: { durationS: 0.2, loop: false },
  holster: { durationS: 0.18, loop: false },
  stab: { durationS: 0.42, loop: false, trail: [0.06, 0.16] },
  slash: { durationS: 0.42, loop: false, trail: [0.04, 0.2], roll: leaning(1, 0.02) },
  quick: { durationS: 0.4, loop: false, trail: [0.06, 0.22], roll: leaning(1, 0.015) },
}

export const BLADE_CLIPS: Readonly<
  Record<MeleeWeapon, Readonly<Partial<Record<BladeClip, BladeClipSpec>>>>
> = {
  katana: KATANA_CLIPS,
  knife: KNIFE_CLIPS,
}

/**
 * O que a arma tem de clipe, ou erro: pedir à faca uma investida é defeito de
 * quem escolheu o clipe, não um clipe vazio.
 *
 * ```ts
 * bladeClipSpec('katana', 'slash_1').durationS // 0.45
 * ```
 */
export function bladeClipSpec(weapon: MeleeWeapon, clip: BladeClip): BladeClipSpec {
  const spec = BLADE_CLIPS[weapon][clip]
  if (spec) return spec
  const known = Object.keys(BLADE_CLIPS[weapon]).join(', ')
  throw new Error(`a ${weapon} não tem o clipe '${clip}'; tem [${known}]`)
}

/** Os nomes já montados, por arma: o viewmodel pede o seu a cada quadro. */
const GROUP_NAMES = new Map<MeleeWeapon, Map<BladeClip, string>>()

/**
 * O nome do grupo de animação no glb. Montado uma vez por par e guardado: o
 * viewmodel o pede a cada quadro, e montar a string ali era lixo por quadro.
 *
 * ```ts
 * bladeGroupName('knife', 'stab') // 'knife_stab'
 * ```
 */
export function bladeGroupName(weapon: MeleeWeapon, clip: BladeClip): string {
  const cached = GROUP_NAMES.get(weapon)?.get(clip)
  if (cached !== undefined) return cached
  const name = `${weapon}_${clip}`
  GROUP_NAMES.set(weapon, (GROUP_NAMES.get(weapon) ?? new Map<BladeClip, string>()).set(clip, name))
  return name
}

/**
 * Os clipes da tabela cuja duração no glb não bate (mais de meio quadro de
 * diferença), ou que o glb não tem. Vazio é o glb e o cliente de acordo.
 *
 * ```ts
 * clipDurationMismatches('knife', new Map([['knife_idle', 2.4]])) // ['knife_draw: …']
 * ```
 */
export function clipDurationMismatches(
  weapon: MeleeWeapon,
  glbDurationsS: ReadonlyMap<string, number>,
): string[] {
  const problems: string[] = []
  for (const [clip, spec] of Object.entries(BLADE_CLIPS[weapon])) {
    const name = bladeGroupName(weapon, clip as BladeClip)
    const found = glbDurationsS.get(name)
    if (found === undefined) problems.push(`${name}: ausente do glb`)
    else if (Math.abs(found - (spec as BladeClipSpec).durationS) > 1 / 120) {
      problems.push(`${name}: ${found} s no glb, ${(spec as BladeClipSpec).durationS} s aqui`)
    }
  }
  return problems
}

/**
 * Quanto o rastro acende num instante do clipe, de 0 a 1: sobe e desce em
 * rampa nas pontas da janela, para não estalar.
 *
 * ```ts
 * trailStrength(bladeClipSpec('katana', 'slash_1'), 0.12) // 1
 * ```
 */
export function trailStrength(spec: BladeClipSpec, clipS: number): number {
  if (!spec.trail) return 0
  const [start, end] = spec.trail
  if (clipS <= start || clipS >= end) return 0
  const ramp = (end - start) * 0.2
  return Math.min(1, (clipS - start) / ramp, (end - clipS) / ramp)
}

/**
 * Uma curva escalar num instante. Antes da primeira chave vale a primeira;
 * depois da última, a última; sem chave nenhuma, zero.
 *
 * ```ts
 * sampleScalar(bladeClipSpec('katana', 'slash_1').roll ?? [], 0.15) // 0.035
 * ```
 */
export function sampleScalar(keys: readonly ScalarKey[], tS: number): number {
  let previous: ScalarKey | undefined
  // laço e não `findIndex`: a seta fecharia sobre `tS` e alocaria por quadro.
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index] as ScalarKey
    if (key.atS > tS) {
      if (!previous) return key.value
      const u = (tS - previous.atS) / (key.atS - previous.atS)
      const eased = u * u * (3 - 2 * u)
      return previous.value + (key.value - previous.value) * eased
    }
    previous = key
  }
  return previous?.value ?? 0
}
