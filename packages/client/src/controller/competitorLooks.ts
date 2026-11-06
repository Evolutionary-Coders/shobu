import { DEFAULT_SNIPER_FINISH, type HumanSkinId } from '@shobu/core'
import { botSkinsFor, DEFAULT_PLAYER_SKIN } from '../character/humanSkins.ts'

/**
 * Como um competidor aparece: o humano que veste, o id do acabamento da sniper
 * e o acento do neon (índice da paleta, `accentForIndex`).
 */
export interface CompetitorLook {
  readonly skin: HumanSkinId
  /** O `WeaponFinish.id`; vazio, ou um id que este cliente não conhece, é o padrão. */
  readonly sniperFinish: string
  readonly accent: number
}

type MutableCompetitorLook = { -readonly [Field in keyof CompetitorLook]: CompetitorLook[Field] }

/**
 * O visual de cada competidor pelo id da sessão. Online, quem decide é a sala
 * (`room`, escrito pelo patch de estado); offline, ou para a vaga que a sala
 * ainda não descreveu, vale a conta local de sempre (`offline`): os bots nas
 * skins que o jogador não usa, e o acento pela vaga.
 */
export interface CompetitorLooks {
  /** O jogador local: a skin e o acabamento da classe, no acento 0. */
  readonly own: MutableCompetitorLook
  readonly offline: Map<string, CompetitorLook>
  /** Um objeto por vaga, reescrito no lugar: o patch roda todo quadro. */
  readonly room: Map<string, MutableCompetitorLook>
  readonly botIds: readonly string[]
}

/**
 * ```ts
 * const looks = createCompetitorLooks(['bot-0', 'bot-1'], 'vex')
 * ```
 */
export function createCompetitorLooks(
  botIds: readonly string[],
  playerSkin: HumanSkinId = DEFAULT_PLAYER_SKIN,
): CompetitorLooks {
  const looks: CompetitorLooks = {
    own: { skin: playerSkin, sniperFinish: DEFAULT_SNIPER_FINISH, accent: 0 },
    offline: new Map(),
    room: new Map(),
    botIds,
  }
  dressOffline(looks)
  return looks
}

/**
 * A classe do jogador local mudou: a skin e o acabamento dele, e com a skin a
 * conta offline dos bots, que nunca vestem a skin do jogador.
 *
 * ```ts
 * dressOwnLook(looks, { characterSkin: 'nova', sniperFinish: 'carbono' })
 * ```
 */
export function dressOwnLook(
  looks: CompetitorLooks,
  chosen: { readonly characterSkin: HumanSkinId; readonly sniperFinish: string },
): void {
  looks.own.sniperFinish = chosen.sniperFinish
  if (looks.own.skin === chosen.characterSkin) return
  looks.own.skin = chosen.characterSkin
  dressOffline(looks)
}

/** A conta de antes da sala: `botSkinsFor` e o acento pela vaga, a partir do 1. */
function dressOffline(looks: CompetitorLooks): void {
  const skins = botSkinsFor(looks.botIds.length, looks.own.skin)
  looks.botIds.forEach((id, index) => {
    const skin = skins[index] as HumanSkinId
    looks.offline.set(id, { skin, sniperFinish: DEFAULT_SNIPER_FINISH, accent: index + 1 })
  })
}

/**
 * O visual que a sala diz para quem ocupa a vaga `botId`, copiado campo a
 * campo para o objeto da vaga: roda por jogador remoto, por quadro.
 *
 * ```ts
 * wearRoomLook(looks, bot.id, view)
 * ```
 */
export function wearRoomLook(looks: CompetitorLooks, botId: string, worn: CompetitorLook): void {
  const look = looks.room.get(botId)
  if (!look) {
    looks.room.set(botId, { skin: worn.skin, sniperFinish: worn.sniperFinish, accent: worn.accent })
    return
  }
  look.skin = worn.skin
  look.sniperFinish = worn.sniperFinish
  look.accent = worn.accent
}

/** A vaga voltou a ser bot local: volta a conta offline. */
export function shedRoomLook(looks: CompetitorLooks, botId: string): void {
  looks.room.delete(botId)
}

/**
 * O visual de um id da sessão: o do jogador, para o id local; o da sala, se
 * ela descreveu a vaga; e a conta offline para o resto.
 *
 * ```ts
 * lookOf(looks, 'bot-0', 'local').skin // 'brick', offline com o jogador de ronin
 * ```
 */
export function lookOf(looks: CompetitorLooks, playerId: string, localId: string): CompetitorLook {
  if (playerId === localId) return looks.own
  return looks.room.get(playerId) ?? looks.offline.get(playerId) ?? STRANGER_LOOK
}

/** Quem a sessão não conhece (a kill chegou antes do patch): o corpo padrão. */
const STRANGER_LOOK: CompetitorLook = {
  skin: DEFAULT_PLAYER_SKIN,
  sniperFinish: DEFAULT_SNIPER_FINISH,
  accent: 0,
}
