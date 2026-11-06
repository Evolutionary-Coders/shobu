import { type MatchSummaryRow, quantizePositionM } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { AT_SPAWN, FakeGameLink, WALK } from './gameLinkFake.ts'
import { createNetworkPort } from './networkPort.ts'
import type { RoomMatchFields } from './roomMatchView.ts'

describe('a sala que fecha', () => {
  /** Regressão: nada soltava a sala fechada, e o jogo seguia preso a ela. */
  it('solta o lugar: sem sala, sem input e sem id', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    link.close()
    expect(port.connected).toBe(false)
    expect(port.ownId).toBeUndefined()
    expect(port.sendTickInput(WALK)).toBeUndefined()
  })

  it('a antiga, fechando depois da troca, não solta a nova', () => {
    const port = createNetworkPort()
    const old = new FakeGameLink()
    port.attach(old)
    port.attach(new FakeGameLink())
    old.close()
    expect(port.connected).toBe(true)
  })
})

describe('as séries de pontuação', () => {
  it('guarda a escolha feita antes da sala e a manda quando ela chega', () => {
    const port = createNetworkPort()
    port.chooseScorestreaks(['ping', 'sonar', 'emp'])
    const link = new FakeGameLink()
    port.attach(link)
    port.chooseScorestreaks(['echo', 'sonar', 'emp'])
    expect(link.scorestreakLoadouts).toEqual([
      ['ping', 'sonar', 'emp'],
      ['echo', 'sonar', 'emp'],
    ])
  })

  it('sem escolha, não manda nada ao conectar', () => {
    const link = new FakeGameLink()
    createNetworkPort().attach(link)
    expect(link.scorestreakLoadouts).toEqual([])
  })

  it('o pedido de série vai para a sala, e sem sala se perde', () => {
    const port = createNetworkPort()
    port.requestScorestreak(0)
    const link = new FakeGameLink()
    port.attach(link)
    port.requestScorestreak(2)
    expect(link.activations).toEqual([2])
  })

  it('entrega cada ganho e cada acionamento da sala uma vez, na ordem', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    link.earn(0, 'ping')
    link.activate('outro', 1, 'sonar')
    const earned: string[] = []
    const activated: string[] = []
    port.drainScorestreakEarned((message) => earned.push(message.scorestreak))
    port.drainScorestreakActivated((message) => activated.push(message.playerId))
    port.drainScorestreakEarned((message) => earned.push(message.scorestreak))
    expect([earned, activated]).toEqual([['ping'], ['outro']])
  })
})

describe('drainKills', () => {
  it('entrega cada kill confirmada uma vez, na ordem', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    link.confirmKill('bia')
    link.confirmKill('caio')
    const first: string[] = []
    port.drainKills((kill) => first.push(kill.victimId))
    const second: string[] = []
    port.drainKills((kill) => second.push(kill.victimId))
    expect(first).toEqual(['bia', 'caio'])
    expect(second).toEqual([])
  })
})

describe('latencyMs', () => {
  /** A tela do ping mostra `--` sem sala e antes da primeira amostra do relógio. */
  it('é o ida e volta do relógio da sala, e null sem sala ou sem amostra', () => {
    const port = createNetworkPort()
    expect(port.latencyMs()).toBeNull()
    const link = new FakeGameLink()
    port.attach(link)
    expect(port.latencyMs()).toBeNull()
    link.rtt = 12.5
    expect(port.latencyMs()).toBe(12.5)
  })
})

describe('drainBoundaryDeaths', () => {
  it('entrega cada morte fora da área uma vez, na ordem', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    link.boundaryDeath('bia')
    link.boundaryDeath('eu')
    const deaths: string[] = []
    port.drainBoundaryDeaths((playerId) => deaths.push(playerId))
    port.drainBoundaryDeaths((playerId) => deaths.push(playerId))
    expect(deaths).toEqual(['bia', 'eu'])
  })
})

describe('drainShots', () => {
  it('entrega cada tiro da sala uma vez, na ordem', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    link.shot('bia')
    link.shot('bot-1')
    const shooters: string[] = []
    port.drainShots((shot) => shooters.push(shot.shooterId))
    port.drainShots((shot) => shooters.push(shot.shooterId))
    expect(shooters).toEqual(['bia', 'bot-1'])
  })
})

describe('chooseMelee', () => {
  /** A classe é escolhida no menu, quase sempre antes de a sala conectar. */
  it('guarda a lâmina escolhida antes da sala e a manda quando ela chega', () => {
    const port = createNetworkPort()
    port.chooseMelee('knife')
    const link = new FakeGameLink()
    port.attach(link)
    port.chooseMelee('katana')
    expect(link.loadouts).toEqual(['knife', 'katana'])
  })

  it('sem escolha, não manda nada ao conectar', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    expect(link.loadouts).toEqual([])
  })
})

describe('choosePrimary', () => {
  /** A classe é escolhida no menu, quase sempre antes de a sala conectar. */
  it('guarda a arma escolhida antes da sala e a manda quando ela chega', () => {
    const port = createNetworkPort()
    port.choosePrimary('classic')
    const link = new FakeGameLink()
    port.attach(link)
    port.choosePrimary('laser')
    expect(link.primaries).toEqual(['classic', 'laser'])
  })

  it('sem escolha, não manda nada ao conectar', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    expect(link.primaries).toEqual([])
  })
})

describe('chooseCallsign', () => {
  /** O nome sai da partida, que pode começar antes de a sala conectar. */
  it('guarda o nome escolhido antes da sala e o manda quando ela chega', () => {
    const port = createNetworkPort()
    port.chooseCallsign('RAIDEN')
    const link = new FakeGameLink()
    port.attach(link)
    port.chooseCallsign('KITSU')
    expect(link.callsigns).toEqual(['RAIDEN', 'KITSU'])
  })

  /** O pedido de entrada leva o nome, e a vaga nova não aparece como AGENTE. */
  it('lembra o último nome para o pedido de entrada', () => {
    const port = createNetworkPort()
    expect(port.chosenCallsign()).toBeUndefined()
    port.chooseCallsign('RAIDEN')
    expect(port.chosenCallsign()).toBe('RAIDEN')
  })

  it('sem nome, não manda nada ao conectar', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    expect(link.callsigns).toEqual([])
  })
})

describe('announceControl', () => {
  /**
   * Regressão (ADR 0031): a vaga que voltava da recarga nascia viva com o
   * jogador ainda no CLIQUE PARA ENTRAR. Agora espera este aviso, e o clique
   * pode vir antes de a reconexão terminar.
   */
  it('o controle pego antes da sala vai quando ela chega, e cada vez que volta', () => {
    const port = createNetworkPort()
    port.announceControl(true)
    const link = new FakeGameLink()
    port.attach(link)
    expect(link.inControlSent).toBe(1)
    port.announceControl(false)
    port.announceControl(true)
    expect(link.inControlSent).toBe(2)
  })

  it('no menu, a sala que chega não ouve nada', () => {
    const port = createNetworkPort()
    port.announceControl(true)
    port.announceControl(false)
    const link = new FakeGameLink()
    port.attach(link)
    expect(link.inControlSent).toBe(0)
  })
})

describe('createNetworkPort', () => {
  it('sabe o próprio id só com sala', () => {
    const port = createNetworkPort()
    expect(port.ownId).toBeUndefined()
    port.attach(new FakeGameLink())
    expect(port.ownId).toBe('eu')
  })

  /** O respawn é do servidor: o cliente renasce onde o patch diz, quando ele volta a vivo. */
  it('entrega o spawn de novo a cada volta da morte', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    link.own = AT_SPAWN
    expect(port.takeOwnSpawn()).toEqual({ x: 26, y: 0, z: 26 })
    link.own = { ...AT_SPAWN, alive: false }
    expect(port.takeOwnSpawn()).toBeUndefined()
    link.own = { ...AT_SPAWN, x: quantizePositionM(-5) }
    expect(port.takeOwnSpawn()).toEqual({ x: -5, y: 0, z: 26 })
    expect(port.takeOwnSpawn()).toBeUndefined()
  })

  it('roda sozinho antes da conexão, sem erro e sem remoto', () => {
    const port = createNetworkPort()
    const visited: string[] = []
    port.sendTickInput(WALK)
    port.forEachRemote(0, (id) => visited.push(id))
    expect(visited).toEqual([])
    expect(port.connected).toBe(false)
  })

  it('passa a falar com a sala depois do attach', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    expect(port.sendTickInput(WALK)).toBe(1)
    const visited: string[] = []
    port.forEachRemote(0, (id) => visited.push(id))
    expect(link.sent).toEqual([WALK])
    expect(visited).toEqual(['outro'])
    expect(port.connected).toBe(true)
  })

  it('entrega o spawn do servidor uma vez, quando o próprio estado chega', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    expect(port.takeOwnSpawn()).toBeUndefined()
    port.attach(link)
    expect(port.takeOwnSpawn()).toBeUndefined()
    link.own = AT_SPAWN
    expect(port.takeOwnSpawn()).toEqual({ x: 26, y: 0, z: 26 })
    expect(port.takeOwnSpawn()).toBeUndefined()
  })

  /** A partida seguinte põe o jogador vivo noutro spawn: a sessão precisa saber onde. */
  it('a partida seguinte entrega o spawn de novo, com o jogador já vivo', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    link.own = AT_SPAWN
    port.takeOwnSpawn()
    port.restartOwnSpawn()
    expect(port.takeOwnSpawn()).toEqual({ x: 26, y: 0, z: 26 })
  })

  it('entrega a confirmação do servidor só com sala e com o próprio estado', () => {
    const port = createNetworkPort()
    expect(port.confirmation()).toBeUndefined()
    const link = new FakeGameLink()
    port.attach(link)
    expect(port.confirmation()).toBeUndefined()
    link.own = AT_SPAWN
    link.acked = 7
    expect(port.confirmation()).toEqual({ ackSeq: 7, own: AT_SPAWN })
  })
})

describe('a partida da sala', () => {
  const RESULTS: RoomMatchFields = {
    phase: 3,
    phaseLeftDs: 75,
    arenaId: 'neon-kaido',
    ballots: new Map([['bot-0', 1]]),
    winner: -1,
    nextArenaId: '',
  }

  it('sem sala, não há partida, voto nem placar', () => {
    const port = createNetworkPort()
    const seen: string[] = []
    port.forEachBallot((voterId) => seen.push(voterId))
    port.forEachOfficialScore((playerId) => seen.push(playerId))
    port.castMapVote(1)
    expect(port.matchState()).toBeUndefined()
    expect(seen).toEqual([])
  })

  it('lê a fase, os segundos e o voto aberto do estado', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    expect(port.matchState()).toBeUndefined()
    link.match = RESULTS
    expect(port.matchState()).toMatchObject({
      phase: 'results',
      phaseLeftS: 7.5,
      winner: undefined,
      nextArenaId: undefined,
    })
    link.match = { ...RESULTS, phase: 4, winner: 1, nextArenaId: 'ichiban-gai' }
    expect(port.matchState()).toMatchObject({ winner: 1, nextArenaId: 'ichiban-gai' })
  })

  it('visita os votos e o placar oficial, e manda o voto do jogador', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    const ballots: [string, number][] = []
    port.forEachBallot((voterId, index) => ballots.push([voterId, index]))
    expect(ballots).toEqual([])
    link.match = RESULTS
    link.scores.set('eu', { points: 300, kills: 3, deaths: 1, streakPoints: 200, pingMs: 40 })
    port.forEachBallot((voterId, index) => ballots.push([voterId, index]))
    const scores: string[] = []
    port.forEachOfficialScore((playerId, score) => scores.push(`${playerId}:${score.points}`))
    port.castMapVote(2)
    expect(ballots).toEqual([['bot-0', 1]])
    expect(scores).toEqual(['eu:300'])
    expect(link.votes).toEqual([2])
  })

  it('guarda o resumo até o quadro seguinte, uma vez', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    const row: MatchSummaryRow = {
      playerId: 'eu',
      points: 100,
      kills: 1,
      deaths: 0,
      kd: 1,
      accuracy: 1,
      bestStreak: 1,
      medals: 0,
    }
    link.summarize([row])
    const drained: (readonly MatchSummaryRow[])[] = []
    port.drainMatchSummary((rows) => drained.push(rows))
    port.drainMatchSummary((rows) => drained.push(rows))
    expect(drained).toEqual([[row]])
  })
})

describe('chooseCosmetics', () => {
  /** Regressão do playtest: o visual nunca saía do navegador, e cada tela vestia os outros a seu modo. */
  it('guarda o visual escolhido antes da sala e o manda quando ela chega', () => {
    const port = createNetworkPort()
    port.chooseCosmetics({ characterSkin: 'vex', sniperFinish: 'carbono' })
    const link = new FakeGameLink()
    port.attach(link)
    port.chooseCosmetics({ characterSkin: 'nova', sniperFinish: 'preta' })
    expect(link.cosmetics).toEqual([
      { characterSkin: 'vex', sniperFinish: 'carbono' },
      { characterSkin: 'nova', sniperFinish: 'preta' },
    ])
  })

  it('reenvia o visual a cada sala nova', () => {
    const port = createNetworkPort()
    port.chooseCosmetics({ characterSkin: 'vex', sniperFinish: 'carbono' })
    port.attach(new FakeGameLink())
    const next = new FakeGameLink()
    port.attach(next)
    expect(next.cosmetics).toEqual([{ characterSkin: 'vex', sniperFinish: 'carbono' }])
  })

  it('lembra o último visual para o pedido de entrada', () => {
    const port = createNetworkPort()
    expect(port.chosenCosmetics()).toBeUndefined()
    port.chooseCosmetics({ characterSkin: 'brick', sniperFinish: 'grafite-neon' })
    expect(port.chosenCosmetics()).toEqual({ characterSkin: 'brick', sniperFinish: 'grafite-neon' })
  })

  it('sem visual, não manda nada ao conectar', () => {
    const link = new FakeGameLink()
    createNetworkPort().attach(link)
    expect(link.cosmetics).toEqual([])
  })
})
