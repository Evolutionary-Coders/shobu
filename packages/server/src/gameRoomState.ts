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
    alive: t.boolean(),
    /** O nome de perfil, ou o apelido do bot. Texto só viaja quando muda. */
    name: t.string(),
    /**
     * A arma principal, índice de `PRIMARY_WEAPONS`. Discreta: só viaja quando
     * muda, e o cliente a copia sem interpolar.
     */
    primary: t.uint8(),
    /**
     * O visual que a sala decide e todo cliente desenha igual: a skin
     * (índice de `HUMAN_SKIN_IDS`), o id do acabamento da sniper e o acento
     * do neon. Discretos, e só viajam quando mudam; quem entra no meio os lê
     * no primeiro patch.
     */
    skin: t.uint8(),
    finish: t.string(),
    accent: t.uint8(),
    /**
     * O placar oficial (ADR 0031): o tab de cada cliente mostra estes números,
     * e quem entra no meio os lê no primeiro patch. Só viajam quando mudam.
     */
    points: t.uint32(),
    kills: t.uint16(),
    deaths: t.uint16(),
    /** Os pontos da vida, que pagam as séries: a barra do hud lê daqui (ADR 0029). */
    streakPoints: t.uint16(),
    /** O rtt que o cliente relata (`notePing`), cosmético; o bot fica em zero. */
    pingMs: t.uint16(),
  },
  'PlayerState',
)

/**
 * A partida da sala, uma só para todos (ADR 0031): a fase, o que falta nela
 * em décimos de segundo e o mapa. Quem entra no meio lê isto no primeiro patch.
 */
/**
 * O voto de expulsão aberto (ADR 0034, `writeKickVoteState`): o alvo, quem
 * abriu, o que falta em décimos e as contagens. Sem voto, `targetId` vazio.
 */
export const KickVoteState = schema(
  {
    targetId: t.string(),
    /** O nome do alvo, guardado na abertura: a faixa o mostra sem procurar o jogador. */
    targetName: t.string(),
    initiatorId: t.string(),
    leftDs: t.uint16(),
    yes: t.uint8(),
    no: t.uint8(),
    needed: t.uint8(),
    /** Eleitor → `KICK_BALLOT_*`: o cliente sabe se vota e se já votou, nunca o quê. */
    ballots: t.map('uint8'),
  },
  'KickVoteState',
)

export const MatchState = schema(
  {
    /** Índice de `MATCH_PHASES`. */
    phase: t.uint8(),
    /** `quantizePhaseLeft`: o teto é a partida sem relógio. */
    phaseLeftDs: t.uint16(),
    /** O `id` do mapa no catálogo. Texto só viaja quando muda. */
    arenaId: t.string(),
    /**
     * Os votos do próximo mapa que a tela já mostra, de quem votou para o
     * índice da opção (`mapVoteOptions`). Os bots aparecem um a um.
     */
    ballots: t.map('uint8'),
    /** O índice da opção que venceu o voto, ou -1 com o voto aberto. */
    winner: t.int8(),
    /** O mapa da próxima partida, quando o voto fecha; vazio antes. */
    nextArenaId: t.string(),
    /** O anfitrião da sala privada, que expulsa sem voto; vazio na pública. */
    hostId: t.string(),
    kickVote: KickVoteState,
  },
  'MatchState',
)

export const GameRoomState = schema(
  { players: t.map(PlayerState), match: MatchState },
  'GameRoomState',
)

/** O input de um tick. O colyseus exige schema plano, só primitivos. */
export const PlayerInput = schema(
  {
    wishX: t.int8(),
    wishZ: t.int8(),
    buttons: t.uint16(),
    aimX: t.int16(),
    aimY: t.int16(),
    aimZ: t.int16(),
  },
  'PlayerInput',
)
