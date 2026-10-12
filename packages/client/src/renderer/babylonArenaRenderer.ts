import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { Engine } from '@babylonjs/core/Engines/engine'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { Scene } from '@babylonjs/core/scene'
import type { GameplayConfig } from '@shobu/core'
import { buildGreyboxArena } from '../arena/buildGreyboxArena.ts'
import { blockoutToStaticBoxes } from '../arena/collisionBoxes.ts'
import { listenFromCamera } from '../audio/cameraEar.ts'
import { driveArenaAudio } from '../audio/driveArenaAudio.ts'
import { bodyYawTargetRad, followBodyYawRad } from '../character/bodyYaw.ts'
import { competitorFeetM } from '../character/competitorAvatar.ts'
import { accentForIndex } from '../character/competitorPalette.ts'
import { type HumanSkinId, portraitsOf } from '../character/humanSkins.ts'
import {
  createLocomotionPose,
  poseOfLocalCharacter,
  thirdPersonClipFor,
} from '../character/thirdPersonClips.ts'
import { createArenaSession, LOCAL_PLAYER_ID } from '../controller/arenaSession.ts'
import { releaseAllButtons, trackHeldButtons } from '../controller/heldButtons.ts'
import { type HeldKeys, releaseAll } from '../controller/heldKeys.ts'
import { createLocalCharacter, type LocalCharacter } from '../controller/localCharacter.ts'
import { createUnlockedSession } from '../controller/unlockedSession.ts'
import { createWeaponInput } from '../controller/weaponInputFrom.ts'
import { createMovementInput } from '../controller/wishDirection.ts'
import { type ArenaHud, createSilentHud } from '../hud/arenaHud.ts'
import { fanOutHud } from '../hud/hudFanout.ts'
import type { SessionMode } from '../hud/matchClock.ts'
import { NULL_LATENCY_SOURCE } from '../instrumentation/latencySource.ts'
import { isPerfMode, isReviewMode } from '../instrumentation/perfMode.ts'
import { ARENA_LOAD_TASKS } from '../loading/arenaLoadTasks.ts'
import { createLoadProgress, type LoadProgress } from '../loading/loadProgress.ts'
import { applyQuality } from './applyQuality.ts'
import { fogArena } from './arenaFog.ts'
import { lightArena } from './arenaLighting.ts'
import type { ArenaRenderer, ArenaRendererOptions, ChosenLooks } from './arenaRenderer.ts'
import { coverWithDaySky } from './arenaSky.ts'
import { attachFirstPersonStage, createWeaponLooks } from './attachFirstPersonStage.ts'
import { attachHeadset } from './attachHeadset.ts'
import { attachLocalCharacter } from './attachLocalCharacter.ts'
import {
  attachMatchEnd,
  type LaunchRules,
  leaveArena,
  looksOf,
  raiseRoomPodium,
} from './attachMatchEnd.ts'
import { attachUnlockedPlay } from './attachUnlockedPlay.ts'
import { attachCameraRain } from './cameraRain.ts'
import { createViewmodelCamera, offerOnlyTheViewmodel } from './createViewmodelCamera.ts'
import { dressWithScenery } from './dressArenaScenery.ts'
import { driveArenaReadouts } from './driveArenaReadouts.ts'
import { driveArenaWeapon } from './driveArenaWeapon.ts'
import { showBots } from './driveBotAvatars.ts'
import { driveGrappleView } from './driveGrappleView.ts'
import { driveLookSensitivity } from './driveLookSensitivity.ts'
import { drivePerfReadout } from './drivePerfReadout.ts'
import { driveFirstPersonLens } from './firstPersonLens.ts'
import { createFirstPersonViewer } from './firstPersonViewer.ts'
import { attachFramePerf } from './framePerf.ts'
import { kickedFovDeg } from './grappleCameraKick.ts'
import { createHeadsetVisor, type HeadsetVisor } from './headsetVisor.ts'
import { createJackInLens, type JackInLens } from './jackInLens.ts'
import {
  type CompetitorAvatarOptions,
  type CompetitorLibrary,
  createCompetitorLibrary,
} from './loadCompetitorAvatar.ts'
import { attachSniperViewmodel } from './loadSniperViewmodel.ts'
import type { LockedMouseLook } from './lockedMouseLook.ts'
import { createPlayerControlNotifier, type PlayerControlNotifier } from './playerControl.ts'
import { requestRawPointerLock } from './rawPointerLock.ts'
import { prefersReducedMotion } from './reducedMotion.ts'
import { createScopeZoom, type ScopeZoom, scopeBlend, scopeFovDeg } from './scopeZoom.ts'
import { createTracerBeams } from './tracerBeams.ts'
import { followWorldCamera, VIEWMODEL_FOV_DEG } from './viewmodelCamera.ts'
import { watchInputMethod } from './watchInputMethod.ts'
import { createWeaponRecoil } from './weaponRecoil.ts'

/**
 * As legendas do narrador nos dois visores: a linha de dom no desktop e no
 * menu, e o canvas do óculos. Com o óculos posto a linha de dom some, como o
 * resto do hud de dom (ADR 0012).
 */
function wireCaptions(
  options: ArenaRendererOptions,
  visor: HeadsetVisor,
  headsetActive: () => boolean,
  onControlChange: (listener: (inControl: boolean) => void) => void,
): void {
  const { audio, captions } = options
  audio?.narrator.captions.subscribe((text) => {
    captions?.write(text)
    visor.setCaption(text)
  })
  onControlChange((inControl) => captions?.setSuppressed(inControl && headsetActive()))
}

/**
 * Onde o competidor de revisão fica de pé, na convenção de altura de olho dos
 * spawns: a rua norte, a leste do caminhão, visível do spawn 0 sem cobrir o
 * poste de treino de (-6, 26) — dois avatares no mesmo lugar viram um borrão.
 */
const REVIEW_POST_M: readonly [number, number, number] = [13, 1.8, 27]

/**
 * Adapter de babylon para a interface `ArenaRenderer`. É o único lugar do
 * cliente que conhece a engine.
 *
 * ```ts
 * const renderer = createBabylonArenaRenderer({ canvas, config, arena, spawnPointM })
 * renderer.start()
 * ```
 */
// raiz de composição: cada linha é uma ligação só, e quebrar em duas funções
// aqui inventaria um nível de indireção que não existe no problema.
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: raiz de composição
export function createBabylonArenaRenderer(options: ArenaRendererOptions): ArenaRenderer {
  // `high-performance`: num notebook com duas gpus, o navegador escolheria a
  // integrada sem este pedido. Em máquina de uma gpu só, não muda nada.
  const engine = new Engine(options.canvas, true, {
    stencil: false,
    powerPreference: 'high-performance',
  })
  const loading = createLoadProgress(ARENA_LOAD_TASKS)
  const { scene, camera, look, viewmodelCamera, viewmodelCandidates } = createArenaScene(
    engine,
    options,
    loading,
  )
  const mouse = trackHeldButtons(options.canvas)
  const perf = attachFramePerf(
    scene,
    engine,
    options.canvas.ownerDocument,
    isPerfMode(window.location.search),
  )
  if (options.perfPanel) {
    drivePerfReadout(options.perfPanel, {
      meter: perf.meter,
      latency: options.latency ?? NULL_LATENCY_SOURCE,
      settings: options.settings.current,
    })
  }
  const movementInput = createMovementInput()
  const weaponInput = createWeaponInput()
  const boxes = blockoutToStaticBoxes(options.arena.blockout)
  const character = createLocalCharacter(
    options.config,
    feetOfSpawn(options, options.spawnPointM),
    boxes,
  )
  const session = createArenaSession({
    config: options.config,
    character,
    boxes,
    navGraph: options.arena.navGraph(),
    movementInput,
    weaponInput,
    playArea: options.arena.playArea,
    respawnFeetM: options.arena.spawnPointsM.map((pointM) => feetOfSpawn(options, pointM)),
  })
  // sem servidor, a sala é só do jogador: fora do controle (no menu), a arena
  // inteira para — bots, relógio e corpo. Senão quem abre as configurações
  // volta morto três vezes. `control` nasce mais abaixo; o quadro só roda
  // depois de `start`, com ele já criado. Com o tempo esgotado, para também:
  // os bots congelam na pose, sem correr no lugar.
  const paused = (): boolean => !control.inControl() || session.matchOver
  const { keyboard, viewBob, stick } = attachLocalCharacter(engine, scene, camera, options, {
    character,
    session,
    movementInput,
    buttons: mouse.buttons,
    weaponInput,
    recordSimulation: perf.recordSimulation,
    paused,
  })
  const beams = createTracerBeams(scene, TRACER_POOL_SIZE, options.config.weapon.tracerLifetimeS)
  const competitors = createCompetitorLibrary(scene, (fraction) =>
    loading.report('competidor', fraction),
  )
  // a barra só fecha com **todos** os competidores na cena: boneco chegando
  // com a partida rodando era travada nos primeiros segundos (medição de 11/10).
  const { podium, raised } = raiseRoomPodium(scene, {
    session,
    arena: options.arena,
    playerSkin: options.playerSkin,
    camera,
    viewmodelCamera,
    competitors,
    capsuleHeightM: options.config.collision.capsuleHeightM,
    headsetActive: () => headset.active,
    frameDeltaMs: () => engine.getDeltaTime(),
  })
  const review = isReviewMode(window.location.search)
    ? [
        mirrorLocalCharacter(
          scene,
          options,
          character,
          keyboard.keys,
          () => engine.getDeltaTime(),
          competitors,
        ),
      ]
    : []
  void Promise.allSettled([
    raised,
    ...review,
    ...showBots(scene, {
      config: options.config,
      session,
      competitors,
      beams,
      paused,
      frameDeltaMs: () => engine.getDeltaTime(),
      playerSkin: options.playerSkin,
    }),
  ]).then(() => loading.finish('competidor'))
  const viewmodel = attachSniperViewmodel(scene, camera, options.config.weapon, loading, () =>
    viewmodelCandidates.invalidate(),
  )
  // o visor de dom no desktop e o do óculos (ADR 0012): o jogo fala com um hud
  // só, e cada visor aparece no seu modo.
  const domHud: ArenaHud = options.hud ?? createSilentHud()
  const visor = createHeadsetVisor(scene, options.config)
  const hud = fanOutHud([domHud, visor.hud])
  const zoom = createScopeZoom(!prefersReducedMotion())
  attachRain(scene, camera, options, zoom)
  // tremor de câmera é o mesmo gatilho vestibular do balanço: quem pediu menos
  // movimento não ganha nem o coice. o recuo da **arma** sobrevive, porque
  // mexer num objeto a 65 cm do olho não é mexer na câmera.
  const recoil = createWeaponRecoil(!prefersReducedMotion())
  const looks = createWeaponLooks()
  const { stage, blade } = attachFirstPersonStage(scene, {
    camera,
    character,
    melee: session.melee,
    bob: viewBob,
    recoil,
    motion: !prefersReducedMotion(),
    sniper: viewmodel,
    looks,
    frameDeltaMs: () => engine.getDeltaTime(),
    onMasked: () => viewmodelCandidates.invalidate(),
    bootBlade: options.meleeWeapon,
  })
  driveArenaWeapon(scene, {
    config: options.config,
    session,
    keys: keyboard.keys,
    buttons: mouse.buttons,
    weaponInput,
    zoom,
    scopeView: hud,
    beams,
    recoil,
    camera,
    viewmodel: () => viewmodel.current,
    sniperShown: () => stage.shot.sniperVisible,
    frameDeltaMs: () => engine.getDeltaTime(),
  })
  const botIds = session.bots.map((bot) => bot.id)
  const portraits = portraitsOf(LOCAL_PLAYER_ID, options.playerSkin, botIds)
  driveArenaReadouts(scene, {
    config: options.config,
    session,
    hud,
    inputMethod: watchInputMethod(scene, options.canvas.ownerDocument),
    keys: keyboard.keys,
    portraits,
  })
  const headset = attachHeadset(scene, {
    camera,
    viewmodelCamera,
    options,
    zoom,
    viewBob,
    viewmodel,
    visor,
  })
  const grappleKick = driveGrappleView(scene, {
    camera,
    character: () => character.current,
    config: options.config,
    motionAllowed: !prefersReducedMotion(),
    headsetActive: () => headset.active,
    bladeRollRad: () => stage.shot.cameraRollRad,
    frameDeltaMs: () => engine.getDeltaTime(),
  })
  const unlockedSession = createUnlockedSession()
  const control = createPlayerControlNotifier(options.canvas, headset, unlockedSession)
  applyQuality({
    scene,
    engine,
    meter: perf.meter,
    settings: options.settings.current,
    inControl: control.inControl,
    onControlChange: control.subscribe,
  })
  attachUnlockedPlay(scene, {
    canvas: options.canvas,
    session: unlockedSession,
    arena: session,
    headset,
    camera,
    look,
    keys: keyboard.keys,
    buttons: mouse.buttons,
    stick,
    settings: options.settings.current,
    inControl: control.inControl,
    frameDeltaMs: () => engine.getDeltaTime(),
  })
  // o modo e o "está na arena" são lidos por quadro: são eles que decidem a
  // faixa da música e se os marcos de partida do narrador valem.
  const sessionStage = { mode: 'match' as SessionMode, inArena: false }
  control.subscribe((inControl) => {
    sessionStage.inArena = inControl
  })
  if (options.audio) {
    driveArenaAudio(scene, {
      config: options.config,
      session,
      mixer: options.audio.mixer,
      narrator: options.audio.narrator,
      mode: () => sessionStage.mode,
      inArena: () => sessionStage.inArena,
      listen: listenFromCamera(camera, Vector3.Forward(), new Vector3()),
    })
  }
  // sem o ponteiro travado não há partida: solta as teclas, senão um W preso no
  // instante do esc deixa o jogador correndo sozinho atrás da tela de boot.
  // o visor chega com o controle e sai com o esc, junto com a tela de boot. No
  // óculos o visor de dom não aparece: ele é uma imagem só, e o óculos desenha
  // duas (ADR 0012).
  control.subscribe((inControl) => {
    domHud.setVisible(inControl && !headset.active)
    visor.hud.setVisible(inControl && headset.active)
    if (inControl) return
    releaseAll(keyboard.keys)
    releaseAllButtons(mouse.buttons)
  })
  wireCaptions(options, visor, () => headset.active, control.subscribe)
  const jackIn = createJackInLens(() => performance.now())
  openLensOnControl(control, jackIn)
  driveFirstPersonLens(scene, {
    worldCamera: camera,
    viewmodelCamera,
    aspectRatio: () => engine.getAspectRatio(camera),
    // a luneta manda no fov do mundo; a lente de entrada multiplica por cima.
    // o `camera` das configurações é vivo: o menu reescreve o fov de quadril
    // nele, e o mesmo objeto atravessa os quadros sem alocar.
    horizontalFovDeg: () =>
      kickedFovDeg(scopeFovDeg(zoom, options.settings.camera), grappleKick, scopeBlend(zoom)),
    viewmodelFovDeg: VIEWMODEL_FOV_DEG,
    jackIn,
  })
  driveLookSensitivity(scene, {
    camera: look,
    zoom,
    cameraConfig: options.settings.camera,
    settings: options.settings.current,
  })
  const resize = (): void => engine.resize()
  window.addEventListener('resize', resize)
  // a partida de agora: a seguinte sai igual.
  const launch = { mode: 'match' as SessionMode, rules: undefined as LaunchRules | undefined }
  const setMode = (mode: SessionMode, rules: LaunchRules, chosen: ChosenLooks): void => {
    looks.sniper = chosen.sniper
    looks.blades[rules.meleeWeapon] = chosen.blade
    // a troca de classe já pediu a lâmina no menu (`prepareMelee`); isto só
    // cobre quem entrou sem passar por lá.
    blade.prepare(rules.meleeWeapon)
    sessionStage.mode = mode
    Object.assign(launch, { mode, rules })
    // o modo é escolhido no menu, um gesto antes de entrar: é aqui que a partida
    // começa e o relógio zera. no treino os bots andam e não atiram.
    session.restartMatch({ ...rules, hostileBots: mode === 'match', timed: mode === 'match' })
    hud.setMode(mode)
  }
  attachMatchEnd(scene, {
    session,
    hud,
    arena: options.arena,
    playerSkin: options.playerSkin,
    portraits,
    podium,
    inControl: control.inControl,
    frameDeltaMs: () => engine.getDeltaTime(),
    switchArena: options.onArenaSwitch,
    replay: () => launch.rules && setMode(launch.mode, launch.rules, looksOf(looks, launch.rules)),
    onLeave: () => leaveArena(headset, unlockedSession),
  })

  return {
    start: () => engine.runRenderLoop(() => scene.render()),
    setMode,
    prepareMelee: blade.prepare,
    enterPointerLock: async () => {
      focusForKeyboard(options.canvas)
      await requestRawPointerLock(options.canvas)
    },
    enterGamepad: async () => {
      focusForKeyboard(options.canvas)
      unlockedSession.enter('gamepad')
    },
    enterTouch: async () => {
      unlockedSession.enter('touch')
    },
    enterHeadset: async () => {
      focusForKeyboard(options.canvas)
      await headset.enter()
    },
    onPlayerControlChange: control.subscribe,
    onLoadProgress: loading.onChange,
    dispose: () => {
      window.removeEventListener('resize', resize)
      keyboard.dispose()
      mouse.dispose()
      control.dispose()
      headset.dispose()
      visor.dispose()
      scene.dispose()
      engine.dispose()
    },
  }
}

interface ArenaScene {
  readonly scene: Scene
  readonly camera: UniversalCamera
  readonly look: LockedMouseLook
  readonly viewmodelCamera: UniversalCamera
  /** A lista de malhas da câmera da arma; a arma, ao chegar, a invalida. */
  readonly viewmodelCandidates: { invalidate(): void }
}

/**
 * Duas câmeras, nesta ordem: o mundo primeiro, a arma depois. O babylon limpa a
 * cor **uma vez** por quadro e dá à segunda câmera um clear só de depth e
 * stencil, que é exatamente o que faz a arma nunca entrar na parede.
 *
 * Por isso `scene.autoClear` tem que continuar ligado: desligá-lo pararia a
 * limpeza de cor do mundo, não a da arma.
 */
function createArenaScene(
  engine: Engine,
  options: ArenaRendererOptions,
  loading: LoadProgress,
): ArenaScene {
  const { canvas } = options
  const scene = new Scene(engine)
  // nada no jogo usa picking do babylon — o tiro é do núcleo —, e com o
  // ponteiro travado o mouse gera centenas de `pointermove` por segundo.
  scene.skipPointerMovePicking = true
  // antes de qualquer malha: é o observador do céu que manda o resto da cena
  // para o grupo de renderização 1, e ele só alcança quem chegar depois dele.
  applyAtmosphere(scene, options)
  const { camera, look } = createFirstPersonViewer(scene, options)
  dressWithScenery(
    scene,
    options.arena,
    buildGreyboxArena(scene, options.arena.blockout),
    loading,
    camera,
  )
  const viewmodelCamera = createViewmodelCamera(scene, canvas.clientWidth / canvas.clientHeight)
  scene.activeCamera = camera
  scene.activeCameras = [camera, viewmodelCamera]
  followViewmodelCamera(scene, camera, viewmodelCamera)
  const viewmodelCandidates = offerOnlyTheViewmodel(scene, viewmodelCamera)
  return { scene, camera, look, viewmodelCamera, viewmodelCandidates }
}

/** A chuva que anda com o olho, quando o mapa tem chuva; some com a luneta. */
function attachRain(
  scene: Scene,
  camera: UniversalCamera,
  options: ArenaRendererOptions,
  zoom: ScopeZoom,
): void {
  const rain = options.arena.atmosphere().rain
  if (rain) attachCameraRain(scene, camera, rain, () => scopeBlend(zoom))
}

/** O céu, a névoa e a luz do mapa da partida (`arenaCatalog.ts`). */
function applyAtmosphere(scene: Scene, options: ArenaRendererOptions): void {
  const atmosphere = options.arena.atmosphere()
  lightArena(scene, atmosphere.lighting)
  fogArena(scene, atmosphere.fog)
  coverWithDaySky(scene, atmosphere.sky, options.config.weapon.hitscanRangeM)
}

/**
 * Mantém a câmera do viewmodel colada na do mundo, **na matriz que de fato
 * desenha**.
 *
 * A cópia tem que acontecer depois de tudo que mexe na câmera do mundo no
 * quadro — o olho interpolado e o coice — e por isso não pode ficar em
 * `onBeforeRenderObservable`, que roda antes desses passos quando registrada
 * cedo.
 *
 * E copiar em `onBeforeCameraRenderObservable` **também não basta sozinho**: o
 * babylon chama `updateTransformMatrix()` **antes** de notificar esse
 * observável (`scene.pure.js`, em `_renderForCamera`), então a matriz de vista
 * já foi calculada com a pose antiga e a cópia só valeria no quadro seguinte.
 * Era isso que fazia a arma tremer quando o jogador girava a mira: ela é filha
 * da câmera do mundo e ia junto na hora, mas era desenhada por uma câmera um
 * quadro atrás.
 *
 * Refazer a matriz depois de copiar é o que fecha a conta. **Medido**: com a
 * câmera girando a 0,02 rad por quadro, a arma andava até 2293 px na tela sem
 * a segunda linha, e 0,01 px com ela.
 */
function followViewmodelCamera(
  scene: Scene,
  world: UniversalCamera,
  viewmodel: UniversalCamera,
): void {
  scene.onBeforeCameraRenderObservable.add((rendering) => {
    if (rendering !== viewmodel) return
    followWorldCamera(world, viewmodel)
    scene.updateTransformMatrix()
  })
}

/** Quantos feixes cabem vivos ao mesmo tempo: o jogador e os bots, com folga para dois tiros cada. */
const TRACER_POOL_SIZE = 8

/** Os spawns estão na convenção de olho; o núcleo trabalha com o pé. */
function feetOfSpawn(
  options: ArenaRendererOptions,
  spawnM: readonly [number, number, number],
): { x: number; y: number; z: number } {
  const [x, y, z] = competitorFeetM(spawnM, options.config.collision.capsuleHeightM)
  return { x, y, z }
}

/**
 * O competidor de revisão **imita o jogador local**, parado no posto: correr,
 * agachar, deslizar e pular na frente dele mostra o clipe de terceira pessoa de
 * cada estado sem precisar de segundo jogador. É o mesmo caminho que o jogador
 * remoto vai percorrer (ADR 0002), com o estado vindo da rede em vez do teclado.
 *
 * Sem `await`: a cena renderiza no primeiro quadro e o avatar entra quando
 * chegar. Falha de carregamento não pode derrubar a arena, então ela vira log
 * estruturado em vez de exceção não tratada.
 */
function mirrorLocalCharacter(
  scene: Scene,
  options: ArenaRendererOptions,
  character: LocalCharacter,
  keys: HeldKeys,
  frameDeltaMs: () => number,
  competitors: CompetitorLibrary,
): Promise<void> {
  const { config } = options
  const pose = createLocomotionPose()
  return competitors
    .spawn(reviewAvatarOptions(config, options.playerSkin))
    .then((avatar) => {
      faceTheSpawn(avatar.root, options.spawnPointM)
      const aimYaw = avatar.root.rotation.y
      let bodyYaw = 0
      scene.onBeforeRenderObservable.add(() => {
        const frameS = frameDeltaMs() / 1000
        poseOfLocalCharacter(character.current, keys, pose)
        avatar.animator.play(thirdPersonClipFor(pose, config.movement), frameS)
        // o corpo se vira para onde anda; o tronco continua devendo a mira, e
        // é por isso que o giro tem teto (ver `bodyYaw.ts`).
        bodyYaw = followBodyYawRad(bodyYaw, bodyYawTargetRad(pose), frameS)
        avatar.root.rotation.y = aimYaw + bodyYaw
      })
    })
    .catch((reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason)
      console.error(JSON.stringify({ event: 'competitor-avatar-load-failed', message }))
    })
}

/** O avatar de revisão é o primeiro a descer, e é ele que conta na barra do boot. */
function reviewAvatarOptions(
  config: GameplayConfig,
  playerSkin: HumanSkinId,
): CompetitorAvatarOptions {
  return {
    eyeM: REVIEW_POST_M,
    capsuleHeightM: config.collision.capsuleHeightM,
    accent: accentForIndex(0),
    // o avatar de revisão imita o jogador local, então veste a skin dele.
    skin: playerSkin,
  }
}

/**
 * A lente fecha e abre toda vez que o jogador ganha o controle — inclusive ao
 * reentrar depois de um esc, porque a tela de boot também refaz a transição
 * dela nesse caso, e o mundo e a tela têm que contar a mesma história.
 *
 * Quem pediu menos movimento não vê a lente mexer: mudança de fov é o mesmo
 * gatilho vestibular que fez jackIn.css cortar as pálpebras e as faixas.
 */
function openLensOnControl(control: PlayerControlNotifier, lens: JackInLens): void {
  control.subscribe((inControl) => {
    if (inControl && !prefersReducedMotion()) lens.play()
  })
}

/**
 * O espelho olha para quem ele imita. O `__root__` que o loader do glTF cria
 * já vem girado meia-volta para trocar a mão do sistema de coordenadas, então
 * `lookAt` no spawn viraria as costas: mira-se no ponto **oposto** ao spawn.
 */
function faceTheSpawn(root: AbstractMesh, spawnM: readonly [number, number, number]): void {
  const [postX, , postZ] = REVIEW_POST_M
  root.lookAt(new Vector3(2 * postX - spawnM[0], 0, 2 * postZ - spawnM[2]))
}

/**
 * O babylon escuta `keydown` **no canvas**, e um canvas só recebe tecla quando
 * tem foco. O clique que pede o ponteiro cai na tela de boot, nunca no canvas,
 * então sem isto o WASD morria antes de chegar ao motor. `tabIndex` porque
 * canvas não é focável por padrão — o babylon só o define quando o ponteiro
 * passa por cima, o que a tela de boot impede.
 */
function focusForKeyboard(canvas: HTMLCanvasElement): void {
  canvas.tabIndex = 0
  canvas.focus({ preventScroll: true })
}

/**
 * A arte entrou: o greybox vira a parede do halo dos neons, ou — sem halo,
 * no celular — sai da gpu (revisão do #16). Arte desatualizada (`undefined`)
 * deixa o greybox como a arena.
 */
