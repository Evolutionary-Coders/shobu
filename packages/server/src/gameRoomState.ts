import { schema, t } from '@colyseus/schema'

/**
 * O estado e o input que o colyseus sincroniza, com as larguras da Tabela 4 de
 * `docs/rede/arquitetura-de-rede.md`. Os campos são os inteiros do
 * `wireFormat` do núcleo: quem arredonda é ele, não o schema, para o cliente e
 * o servidor arredondarem com o mesmo código.
 */

/** O snapshot de um jogador que os outros clientes interpolam. */
export const PlayerState = schema(
  {
    x: t.int16(),
    y: t.int16(),
    z: t.int16(),
    aimX: t.int16(),
    aimY: t.int16(),
    aimZ: t.int16(),
    stance: t.uint8(),
  },
  'PlayerState',
)

export const GameRoomState = schema({ players: t.map(PlayerState) }, 'GameRoomState')

/** O input de um tick. O colyseus exige schema plano, só primitivos. */
export const PlayerInput = schema(
  {
    wishX: t.int8(),
    wishZ: t.int8(),
    buttons: t.uint8(),
    aimX: t.int16(),
    aimY: t.int16(),
    aimZ: t.int16(),
  },
  'PlayerInput',
)
