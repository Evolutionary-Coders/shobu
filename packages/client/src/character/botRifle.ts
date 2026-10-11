import type { Vector3 } from '@shobu/core'

/**
 * O rifle na mão de um bot, como dado: em que osso ele vai, onde fica a boca
 * do cano, para onde ele aponta e quanto dura o clarão do tiro. Quem mexe no
 * babylon é `renderer/driveBotAvatars.ts`; aqui é a conta, testada.
 *
 * O modelo é `public/assets/character/bot-rifle.glb`, feito por
 * `scripts/blender/bot_rifle.py`: origem no punho, cano em +z.
 */

/**
 * O osso onde o rifle se apoia: a mão direita do Mannequin da UAL. **É o
 * acoplamento com o `competitor.glb`** — quem trocar o boneco (a reestilização
 * da cidade, por exemplo) precisa manter um osso com este nome, ou mudar este.
 */
export const RIFLE_HAND_BONE = 'hand_r'

/**
 * O clipe de onde sai a pose dos braços de quem segura a arma. O competidor
 * não tem clipe de rifle; o de pistola põe as duas mãos à frente do peito, e
 * é o mais perto disso que o asset oferece. Os braços ficam nessa pose por
 * cima de qualquer clipe de locomoção — correndo, as pernas correm e os braços
 * seguram a arma.
 */
export const RIFLE_HOLD_CLIP = 'Pistol_Idle_Loop'

/** Os ossos dos dois braços, da clavícula aos dedos: os que a pose de empunhar sobrescreve. */
export const RIFLE_HOLD_BONES: readonly string[] = ['l', 'r'].flatMap((side) =>
  [
    'clavicle',
    'upperarm',
    'lowerarm',
    'hand',
    'index_01',
    'index_02',
    'middle_01',
    'middle_02',
    'ring_01',
    'ring_02',
    'pinky_01',
    'pinky_02',
    'thumb_01',
    'thumb_02',
  ].map((bone) => `${bone}_${side}`),
)

/**
 * A boca do cano no espaço do rifle (`Muzzle` no glb): 93 cm à frente do
 * punho e 3,5 cm acima. O teste confere este número contra o arquivo.
 */
export const RIFLE_MUZZLE_LOCAL_M: Readonly<Vector3> = { x: 0, y: 0.035, z: 0.93 }

/**
 * Do pulso, onde o osso da mão nasce, ao meio da palma: é onde o punho do
 * rifle encaixa, e não no pulso.
 */
export const GRIP_AHEAD_OF_WRIST_M = 0.07

/**
 * O "para cima" do rifle apontado para `aimM` sem rolar: perpendicular à mira,
 * no plano vertical dela. Sem trigonometria — é o mesmo vetor que o giro de
 * guinada e arfagem do babylon produz.
 *
 * ```ts
 * rifleUpM({ x: 0, y: 0, z: 1 }, out) // { x: 0, y: 1, z: 0 }
 * ```
 */
export function rifleUpM(aimM: Readonly<Vector3>, out: Vector3): Vector3 {
  const level = Math.sqrt(aimM.x * aimM.x + aimM.z * aimM.z)
  if (level === 0) {
    // mirando reto para cima ou para baixo, o "para cima" é a frente do mundo.
    out.x = 0
    out.y = 0
    out.z = aimM.y > 0 ? -1 : 1
    return out
  }
  out.x = (-aimM.y * aimM.x) / level
  out.y = level
  out.z = (-aimM.y * aimM.z) / level
  return out
}

/**
 * Onde o punho fica: a mão mais um palmo na direção da mira.
 *
 * ```ts
 * rifleGripM(handM, bot.aimM, grip)
 * ```
 */
export function rifleGripM(
  handM: Readonly<Vector3>,
  aimM: Readonly<Vector3>,
  out: Vector3,
): Vector3 {
  out.x = handM.x + aimM.x * GRIP_AHEAD_OF_WRIST_M
  out.y = handM.y + aimM.y * GRIP_AHEAD_OF_WRIST_M
  out.z = handM.z + aimM.z * GRIP_AHEAD_OF_WRIST_M
  return out
}

/**
 * A boca do cano em mundo, com o rifle no punho `gripM` apontado para `aimM`
 * (unitário). É de onde sai o rastro do tiro do bot e o clarão.
 *
 * ```ts
 * rifleMuzzleM(grip, bot.aimM, up, muzzle)
 * ```
 */
export function rifleMuzzleM(
  gripM: Readonly<Vector3>,
  aimM: Readonly<Vector3>,
  upM: Vector3,
  out: Vector3,
): Vector3 {
  rifleUpM(aimM, upM)
  const { y: lift, z: reach } = RIFLE_MUZZLE_LOCAL_M
  out.x = gripM.x + aimM.x * reach + upM.x * lift
  out.y = gripM.y + aimM.y * reach + upM.y * lift
  out.z = gripM.z + aimM.z * reach + upM.z * lift
  return out
}

/** O clarão da boca do cano: um quadro ou três, como o de verdade. */
export const MUZZLE_FLASH_S = 0.06

/**
 * A opacidade do clarão, `leftS` antes de ele apagar: cheio no tiro e linear
 * até zero.
 *
 * ```ts
 * muzzleFlashOpacity(MUZZLE_FLASH_S) // 1
 * ```
 */
export function muzzleFlashOpacity(leftS: number): number {
  return Math.max(0, Math.min(1, leftS / MUZZLE_FLASH_S))
}

/** Dezesseis números por rifle no buffer das thin instances. */
export const RIFLE_MATRIX_FLOATS = 16

/**
 * Escreve no buffer de thin instances a matriz do rifle `index`: punho em
 * `gripM`, cano na mira. As linhas são os eixos do rifle em mundo — direita,
 * cima, frente — e a posição, que é como o babylon lê a matriz (vetor linha
 * vezes matriz). De mão esquerda: a direita é cima × frente.
 *
 * ```ts
 * writeRifleMatrix(buffer, 0, grip, bot.aimM, up)
 * ```
 */
export function writeRifleMatrix(
  buffer: Float32Array,
  index: number,
  gripM: Readonly<Vector3>,
  aimM: Readonly<Vector3>,
  upM: Vector3,
): void {
  const up = rifleUpM(aimM, upM)
  const at = index * RIFLE_MATRIX_FLOATS
  buffer[at] = up.y * aimM.z - up.z * aimM.y
  buffer[at + 1] = up.z * aimM.x - up.x * aimM.z
  buffer[at + 2] = up.x * aimM.y - up.y * aimM.x
  buffer[at + 3] = 0
  buffer[at + 4] = up.x
  buffer[at + 5] = up.y
  buffer[at + 6] = up.z
  buffer[at + 7] = 0
  buffer[at + 8] = aimM.x
  buffer[at + 9] = aimM.y
  buffer[at + 10] = aimM.z
  buffer[at + 11] = 0
  buffer[at + 12] = gripM.x
  buffer[at + 13] = gripM.y
  buffer[at + 14] = gripM.z
  buffer[at + 15] = 1
}

/**
 * Some com o rifle `index`: a matriz zero encolhe a malha a um ponto. Bot
 * morto ou com o avatar ainda baixando não segura arma.
 */
export function hideRifle(buffer: Float32Array, index: number): void {
  buffer.fill(0, index * RIFLE_MATRIX_FLOATS, (index + 1) * RIFLE_MATRIX_FLOATS)
}
