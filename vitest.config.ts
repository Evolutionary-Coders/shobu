import { defineConfig } from 'vitest/config'

/**
 * Os adapters de i/o, e a única coisa que fica fora da conta de cobertura.
 * Cada arquivo aqui fala com a engine, com o dom ou com a rede, e por decisão
 * da adr 0001 nenhum teste abre navegador para exercitá-lo.
 *
 * Esta lista é o inventário do que aquela decisão deixa sem verificação, e
 * entrar nela é o custo — visível no diff — de escrever lógica dentro de um
 * adapter em vez de fora dele. `coverageExclusions.test.ts` é a tranca: só
 * aceita aqui arquivo que de fato toca engine, dom ou rede.
 */
export const IO_ADAPTERS: readonly string[] = [
  'packages/client/src/main.ts',
  'packages/client/src/arena/buildGreyboxArena.ts',
  'packages/client/src/audio/driveArenaAudio.ts',
  'packages/client/src/audio/musicStream.ts',
  'packages/client/src/audio/narrator.ts',
  'packages/client/src/audio/webAudioMixer.ts',
  'packages/client/src/audio/webAudioSpatial.ts',
  'packages/client/src/config/fetchGameplayConfig.ts',
  'packages/client/src/hud/arenaHud.ts',
  'packages/client/src/hud/arenaHudPerf.ts',
  'packages/client/src/hud/arenaHudBoundary.ts',
  'packages/client/src/hud/arenaHudCombatLog.ts',
  'packages/client/src/hud/arenaHudDeathNotice.ts',
  'packages/client/src/hud/arenaHudFeeds.ts',
  'packages/client/src/hud/arenaHudKillBanner.ts',
  'packages/client/src/hud/arenaHudMatchEnd.ts',
  'packages/client/src/hud/narratorCaptionLine.ts',
  'packages/client/src/hud/killIconDom.ts',
  'packages/client/src/hud/arenaHudLayer.ts',
  'packages/client/src/hud/arenaHudLoadout.ts',
  'packages/client/src/hud/arenaHudScoreboard.ts',
  'packages/client/src/hud/arenaHudStatus.ts',
  'packages/client/src/hud/bootMenu.ts',
  'packages/client/src/hud/fullscreenOnGesture.ts',
  'packages/client/src/hud/touchControls.ts',
  'packages/client/src/hud/bootOverlay.ts',
  'packages/client/src/hud/domLineSink.ts',
  'packages/client/src/hud/fetchGlyphSheet.ts',
  'packages/client/src/hud/hudComponentsDom.ts',
  'packages/client/src/hud/jackInLayer.ts',
  'packages/client/src/renderer/arenaFog.ts',
  'packages/client/src/renderer/attachContactShadow.ts',
  'packages/client/src/renderer/arenaLighting.ts',
  'packages/client/src/renderer/arenaSky.ts',
  'packages/client/src/renderer/attachHeadset.ts',
  'packages/client/src/renderer/babylonArenaRenderer.ts',
  'packages/client/src/renderer/playerControl.ts',
  'packages/client/src/renderer/attachLocalCharacter.ts',
  'packages/client/src/renderer/framePerf.ts',
  'packages/client/src/renderer/applyQuality.ts',
  'packages/client/src/renderer/reducedMotion.ts',
  'packages/client/src/renderer/cardboardView.ts',
  'packages/client/src/renderer/competitorAnimator.ts',
  'packages/client/src/renderer/createViewmodelCamera.ts',
  'packages/client/src/renderer/driveArenaReadouts.ts',
  'packages/client/src/renderer/driveArenaWeapon.ts',
  'packages/client/src/renderer/driveBotAvatars.ts',
  'packages/client/src/renderer/driveCameraFromCharacter.ts',
  'packages/client/src/renderer/driveGrappleView.ts',
  'packages/client/src/renderer/neonGlow.ts',
  'packages/client/src/renderer/thinInstances.ts',
  'packages/client/src/renderer/firstPersonViewer.ts',
  'packages/client/src/renderer/flattenPbrMaterial.ts',
  'packages/client/src/renderer/gamepadControls.ts',
  'packages/client/src/renderer/touchPlay.ts',
  'packages/client/src/renderer/attachUnlockedPlay.ts',
  'packages/client/src/renderer/gltfPipeline.ts',
  'packages/client/src/renderer/greyboxMaterials.ts',
  'packages/client/src/renderer/headsetVisor.ts',
  'packages/client/src/renderer/loadArenaScenery.ts',
  'packages/client/src/renderer/loadCompetitorAvatar.ts',
  'packages/client/src/renderer/loadBotRifles.ts',
  'packages/client/src/renderer/loadSniperViewmodel.ts',
  'packages/client/src/renderer/paintCompetitor.ts',
  'packages/client/src/renderer/tracerBeams.ts',
  'packages/client/src/renderer/beamMeshes.ts',
  'packages/client/src/renderer/attachBladeViewmodel.ts',
  'packages/client/src/renderer/paintWeapons.ts',
  'packages/client/src/renderer/attachFirstPersonStage.ts',
  'packages/client/src/renderer/dropLeftArm.ts',
  'packages/client/src/renderer/cameraRain.ts',
  'packages/client/src/renderer/animateBillboards.ts',
  'packages/client/src/renderer/puddleMirror.ts',
  'packages/client/src/renderer/dressArenaScenery.ts',
  'packages/client/src/renderer/attachMatchEnd.ts',
  'packages/client/src/renderer/driveMatchEnd.ts',
  'packages/client/src/renderer/matchEndInput.ts',
  'packages/client/src/renderer/mvpPodium.ts',
]

// headless por decisão: nenhum teste abre navegador (adr 0001).
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    // teste que só passa na ordem em que foi escrito não é teste independente.
    sequence: { shuffle: { files: true, tests: true } },
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', ...IO_ADAPTERS],
      reporter: ['text-summary'],
      // 100% no que roda headless: é a forma verificável de "toda função nova
      // ganha teste". Baixar este número exige justificar no diff por quê.
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
})
