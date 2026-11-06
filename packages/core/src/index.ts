export type { ArenaLayer, GreyboxBlock, Vec3 } from './arena/arenaBlock.ts'
export { blockBetween, blockTopM, halfTurn, standingTierOf } from './arena/arenaBlock.ts'
export type { ArenaLayout } from './arena/arenaLayout.ts'
export { ICHIBAN_GAI_LAYOUT, NEON_KAIDO_LAYOUT } from './arena/arenaLayout.ts'
export type { ArtColliderEntry, RawArtCollider } from './arena/artColliders.ts'
export { artCollidersFrom } from './arena/artColliders.ts'
export {
  arenaCollisionBoxes,
  blockoutToStaticBoxes,
  propsToStaticBoxes,
} from './arena/collisionBoxes.ts'
export {
  ICHIBAN_GAI_BLOCKOUT,
  ICHIBAN_GAI_PLAY_AREA,
  ICHIBAN_GAI_SPAWN_POINTS_M,
} from './arena/ichibanGai.ts'
export { ichibanGaiLanterns } from './arena/ichibanGaiLanterns.ts'
export { ichibanGaiNavGraph } from './arena/ichibanGaiNavGraph.ts'
export {
  NEON_KAIDO_BLOCKOUT,
  NEON_KAIDO_MID_M,
  NEON_KAIDO_PLAY_AREA,
  NEON_KAIDO_SPAWN_POINTS_M,
  NEON_KAIDO_TOP_M,
} from './arena/neonKaido.ts'
export { neonKaidoNavGraph } from './arena/neonKaidoNavGraph.ts'
export type { PropCollider } from './arena/propCollider.ts'
export { propBetween } from './arena/propCollider.ts'
export { spawnFeetM } from './arena/spawnFeet.ts'
export type { BotAimTangents, BotHand, TriggerSight } from './bots/botAim.ts'
export {
  aimAlongStride,
  aimAtFoe,
  aimErrorM,
  botHandFor,
  pullTriggers,
  rerollAimAfterShot,
  settleTangent,
  steadyOnNewTarget,
} from './bots/botAim.ts'
export { BOT_CALLSIGNS, botCallsigns } from './bots/botCallsigns.ts'
export type { BotLocomotion, LegStatus, MutableMovementInput } from './bots/botLocomotion.ts'
export {
  ARRIVE_RADIUS_M,
  createBotLocomotion,
  hasReached,
  horizontalDistanceM,
  routeTo,
  steerToward,
  walkRoute,
} from './bots/botLocomotion.ts'
export type { BotIdentity, BotMind, BotPlayer, MutableWeaponInput } from './bots/botPlayer.ts'
export { createBotPlayer, forgetFighters, resetBotBody } from './bots/botPlayer.ts'
export type { BotView, MutableBotView, PassingShot } from './bots/botSenses.ts'
export {
  CHEST_HEIGHT_RATIO,
  chestOffset,
  createBotView,
  isVisibleFoe,
  LOOK_AROUND_INTERVAL_S,
  lookAround,
  nearestVisibleFoe,
  noticeShot,
  sampleAimJitter,
} from './bots/botSenses.ts'
export type { BotDifficulty } from './bots/botSkill.ts'
export { BOT_DIFFICULTIES, botSkillFor } from './bots/botSkill.ts'
export type { BotArena, BotSquad, BotSquadOptions, BotTick } from './bots/botSquad.ts'
export {
  aimAndTrigger,
  createBotSquad,
  isBenched,
  isSquadBotId,
  moveBot,
  placeBot,
  seatBots,
  setBotDifficulty,
} from './bots/botSquad.ts'
export type { NavGraph, NavLink, NavLinkKind, NavLinkSpec, NavNode } from './bots/navGraph.ts'
export { createNavGraph, linkBetween, nearestNavNode } from './bots/navGraph.ts'
export type { NavRoute, RoutePlanner } from './bots/navRoute.ts'
export {
  createNavRoute,
  createRoutePlanner,
  currentWaypoint,
  planRoute,
  previousWaypoint,
} from './bots/navRoute.ts'
export { botSeatsFor } from './bots/roomSeats.ts'
export {
  COLLIDER_BODY_ONLY,
  COLLIDER_GRAPPLE_ONLY,
  COLLIDER_SHOT_AND_GRAPPLE,
  COLLIDER_SOLID,
  STOPS_BODY,
  STOPS_GRAPPLE,
  STOPS_SHOT,
  stopsAny,
} from './collision/colliderMask.ts'
export type { BoxHit } from './collision/raycastBoxes.ts'
export { createBoxHit, nearestBoxHit, raycastBoxes } from './collision/raycastBoxes.ts'
export { nearestTargetHit } from './collision/raycastTargets.ts'
export type { PlayerBox, StaticBox } from './collision/staticBox.ts'
export { boxFromCenterSize, overlaps, overlapsAny } from './collision/staticBox.ts'
export { hasHeadroom, subStepCount, sweepCharacter } from './collision/sweepCharacter.ts'
export type { TargetList, TargetSlot } from './collision/targetList.ts'
export { createTargetList, pushTarget, resetTargetList } from './collision/targetList.ts'
export {
  DEFAULT_GAMEPLAY_CONFIG,
  type DeployEnv,
  gameplayConfigUrl,
  portSetting,
} from './config/deploySettings.ts'
export type {
  BotSkillConfig,
  BotsConfig,
  CameraConfig,
  GameplayConfig,
  GrappleConfig,
  MatchConfig,
  MeleeConfig,
  MovementConfig,
  VoiceConfig,
  WeaponConfig,
} from './config/gameplayConfig.ts'
export { GAMEPLAY_CONFIG_SPEC } from './config/gameplayConfigSpec.ts'
export { parseGameplayConfig } from './config/parseGameplayConfig.ts'
export type { HumanSkinId } from './cosmetics/competitorLook.ts'
export {
  ACCENT_COUNT,
  DEFAULT_HUMAN_SKIN,
  DEFAULT_SNIPER_FINISH,
  decodeHumanSkin,
  encodeHumanSkin,
  freeAccentOf,
  HUMAN_SKIN_IDS,
  isHumanSkin,
  isSniperFinishId,
  serverBotAccentOf,
  serverBotSkinOf,
} from './cosmetics/competitorLook.ts'
export type { Fighter } from './match/fighter.ts'
export {
  collectFighterTargets,
  killFighter,
  pickSpawn,
  stepRespawnClock,
} from './match/fighter.ts'
export type { FighterAim, ShotRange, SniperKillMoment } from './match/fighterShot.ts'
export {
  describeSniperKill,
  fighterShotRandom,
  MATCH_SEED_BASE,
  resolveFighterShot,
} from './match/fighterShot.ts'
export type {
  FighterStrike,
  MeleeKillMoment,
  StrikeRange,
} from './match/fighterStrike.ts'
export {
  describeMeleeKill,
  facingCosine,
  resolveFighterStrike,
} from './match/fighterStrike.ts'
export type { LeadershipCallout, LeadershipWatch } from './match/leadership.ts'
export {
  createLeadershipWatch,
  leadershipCalloutSince,
  resetLeadershipWatch,
} from './match/leadership.ts'
export type { BallotWindow, MapBallot, MapVoteOutcome } from './match/mapVote.ts'
export {
  BOT_BALLOT_WINDOW,
  ballotsCastBy,
  botBallots,
  castBallot,
  decideMapVote,
  mapVoteOptions,
  RANDOM_MAP_OPTION,
  tallyMapVote,
} from './match/mapVote.ts'
export type { MatchCycle, MatchCycleEdge, MatchPhase } from './match/matchCycle.ts'
export {
  createMatchCycle,
  isFrozenPhase,
  matchPhaseFrozen,
  matchPhaseLeftS,
  matchPhaseLengthS,
  matchPhaseScores,
  restartMatchCycle,
  scoreLimitReached,
  stepMatchCycle,
} from './match/matchCycle.ts'
export { compareForMvp, finalStandings, leaderPoints, pickMvp } from './match/matchMvp.ts'
export type { MatchSummaryRow } from './match/matchSummary.ts'
export { podiumOf, summarizeMatch } from './match/matchSummary.ts'
export type { BoundaryClock, BoundaryStatus, PlayArea } from './match/playArea.ts'
export {
  boundaryRemainingS,
  createBoundaryClock,
  isInsidePlayArea,
  stepBoundary,
} from './match/playArea.ts'
export {
  DEFAULT_PROFILE_NAME,
  PROFILE_NAME_MAX,
  profileNameLabel,
  sanitizeProfileName,
  typedProfileName,
} from './match/profileName.ts'
export { fnv1a32 } from './math/fnv1a.ts'
export type { SeededRandom } from './math/seededRandom.ts'
export { createSeededRandom, nextUnit } from './math/seededRandom.ts'
export type { Vector3 } from './math/vector3.ts'
export {
  addScaled,
  clampLength,
  cross,
  dot,
  lengthSquared,
  normalizeInPlace,
  scaleInPlace,
} from './math/vector3.ts'
export type { MedalAward } from './medals/awardMedals.ts'
export { awardMedals, createMedalAwards } from './medals/awardMedals.ts'
export type { Medal, MedalRarity, MedalSlug } from './medals/medalCatalog.ts'
export { MEDAL_CATALOG, medalBySlug } from './medals/medalCatalog.ts'
export type { MedalRule, MedalSubject } from './medals/medalRules.ts'
export { MEDAL_RULES, multiKillCount } from './medals/medalRules.ts'
export type { YawTurnTracker } from './medals/yawTurnTracker.ts'
export {
  createSpinTracker,
  createYawTurnTracker,
  noteYaw,
  yawTurnWithin,
} from './medals/yawTurnTracker.ts'
export type { MeleeReach, StrikeReach } from './melee/meleeReach.ts'
export { createMeleeReach } from './melee/meleeReach.ts'
export type { MeleeState, MeleeStrikeKind, MeleeWeapon } from './melee/meleeState.ts'
export { createMeleeState, MELEE_WEAPONS, rearmMelee } from './melee/meleeState.ts'
export type { MeleeHit, MeleeStrikeOrigin } from './melee/resolveMeleeStrike.ts'
export { createMeleeHit, resolveMeleeStrike } from './melee/resolveMeleeStrike.ts'
export type { ArmedMovementInput, Arsenal } from './melee/stepArsenal.ts'
export { armMovementInput, stepArsenal } from './melee/stepArsenal.ts'
export { stepMelee } from './melee/stepMelee.ts'
export type { CharacterState, Stance } from './movement/characterState.ts'
export {
  copyCharacterState,
  createCharacterState,
  EYE_HEIGHT_RATIO,
  eyeOf,
  horizontalSpeed,
  JUMPS_PER_FLIGHT,
  respawnCharacter,
} from './movement/characterState.ts'
export { CROUCH_CAPSULE_RATIO } from './movement/crouch.ts'
export { findGrappleAnchor } from './movement/grapple.ts'
export { maxDoubleJumpHeightM, maxJumpHeightM } from './movement/jump.ts'
export type { MovementInput } from './movement/movementInput.ts'
export { hasWish, IDLE_INPUT, wishLength, wishUnit } from './movement/movementInput.ts'
export { SLIDE_CAPSULE_RATIO, SLIDE_ENTRY_SPEED_RATIO } from './movement/slide.ts'
export { stepCharacter } from './movement/stepCharacter.ts'
export { tacticalTankRatio } from './movement/tacticalSprint.ts'
export type {
  KickRequest,
  KickRequestResult,
  KickRoomHuman,
  KickRoomView,
  KickVote,
  KickVoteBook,
  KickVoteOutcome,
  KickVoteRefusal,
  KickVoteRules,
  KickVoteVerdict,
} from './room/kickVote.ts'
export {
  castKickBallot,
  closeKickVote,
  createKickVoteBook,
  hostOf,
  kickVotesNeeded,
  kickVoteVerdict,
  requestKick,
} from './room/kickVote.ts'
export { generateRoomAddress, isReservedAddress, parseRoomAddress } from './room/roomAddress.ts'
export type {
  EntryLook,
  RoomEntryRequest,
  RoomVisibility,
  SeatOffer,
  VoiceTicket,
} from './room/roomEntry.ts'
export {
  entryCallsignOf,
  entryDeviceKeyOf,
  entryLookOf,
  MAP_RELOAD_LIVE_GRACE_S,
  mapReloadHoldS,
  parseRoomEntryRequest,
  ROOM_ENTRY_PATH,
  ROOM_MOVE_MESSAGE,
  SEAT_RESERVATION_S,
  VOICE_TICKET_MESSAGE,
} from './room/roomEntry.ts'
export type { KillEvent, KillWeapon, MutableKillEvent } from './scoring/killEvent.ts'
export { createKillEvent, isHeadshotKill, isMeleeKill } from './scoring/killEvent.ts'
export { recordAwardedKill, recordKill } from './scoring/recordKill.ts'
export type { PlayerScore, Scoreboard } from './scoring/scoreboard.ts'
export {
  addPlayer,
  applyBoundaryDeath,
  applyKill,
  createScoreboard,
  killsWithin,
  MULTIKILL_MEMORY,
  rankedScores,
  recordShot,
  removePlayer,
  resetScoreboard,
} from './scoring/scoreboard.ts'
export { pickBotScorestreaks } from './streaks/botScorestreaks.ts'
export type {
  Scorestreak,
  ScorestreakSlug,
  ScorestreakTier,
} from './streaks/scorestreakCatalog.ts'
export {
  findScorestreak,
  SCORESTREAK_CATALOG,
  SCORESTREAK_TIER_ACCENT,
  scorestreakBySlug,
  scorestreakCost,
} from './streaks/scorestreakCatalog.ts'
export type {
  ScorestreakLedger,
  ScorestreakNotice,
  ScorestreakNoticeKind,
} from './streaks/scorestreakLedger.ts'
export {
  activateScorestreak,
  confirmScorestreakEarned,
  createScorestreakLedger,
  creditScorestreakKill,
  dropScorestreaks,
  enlistScorestreaks,
  forgetScorestreakDeath,
  rechooseScorestreaks,
  resetScorestreakLedger,
} from './streaks/scorestreakLedger.ts'
export type { ScorestreakSlots } from './streaks/scorestreakSlots.ts'
export {
  createScorestreakSlots,
  DEFAULT_SCORESTREAK_LOADOUT,
  earnScorestreaks,
  forgetScorestreakLife,
  parseScorestreakLoadout,
  resetScorestreakSlots,
  SCORESTREAK_SLOT_COUNT,
  sameScorestreakLoadout,
  spendScorestreak,
} from './streaks/scorestreakSlots.ts'
export type { FixedTickAccumulator } from './time/fixedTickAccumulator.ts'
export { consumeTicks, createFixedTickAccumulator } from './time/fixedTickAccumulator.ts'
export { applySpread } from './weapon/aimSpread.ts'
export { hitHeightRatio } from './weapon/hitHeight.ts'
export type { PrimaryWeapon } from './weapon/primaryWeapon.ts'
export {
  DEFAULT_PRIMARY_WEAPON,
  decodePrimaryWeapon,
  encodePrimaryWeapon,
  isPrimaryWeapon,
  PRIMARY_WEAPONS,
} from './weapon/primaryWeapon.ts'
export type { ShotHit, ShotOrigin } from './weapon/resolveShot.ts'
export { createShotHit, resolveShot } from './weapon/resolveShot.ts'
export { spreadTangent } from './weapon/spreadTangent.ts'
export { stepWeapon } from './weapon/stepWeapon.ts'
export type { WeaponInput } from './weapon/weaponInput.ts'
export { IDLE_WEAPON_INPUT } from './weapon/weaponInput.ts'
export type { WeaponPhase, WeaponState } from './weapon/weaponState.ts'
export {
  canFire,
  closeScope,
  copyWeaponState,
  createWeaponState,
  isExactShot,
  isReloading,
  rearmWeapon,
  weaponHoldsSprint,
  weaponPhase,
} from './weapon/weaponState.ts'
export type {
  KickVoteBallotMessage,
  KickVoteClosedMessage,
  KickVoteRefusedMessage,
  KickVoteStartMessage,
} from './wire/kickVoteWire.ts'
export {
  KICK_CLOSE_CODE,
  KICK_VOTE_BALLOT_MESSAGE,
  KICK_VOTE_CLOSED_MESSAGE,
  KICK_VOTE_REFUSED_MESSAGE,
  KICK_VOTE_START_MESSAGE,
  kickBallotOf,
  kickTargetOf,
  parseDeviceKey,
} from './wire/kickVoteWire.ts'
export type { RoomKillMessage, RoomMedal } from './wire/roomKillMedals.ts'
export { roomMedalAwards, roomMedalsOf } from './wire/roomKillMedals.ts'
export type {
  AfkWarningMessage,
  BoundaryDeathMessage,
  CallsignMessage,
  CosmeticLoadoutMessage,
  LoadoutMessage,
  MapVoteMessage,
  MatchSummaryMessage,
  MutableWireAim,
  PingReportMessage,
  PrimaryLoadoutMessage,
  ScorestreakActivatedMessage,
  ScorestreakActivateMessage,
  ScorestreakEarnedMessage,
  ScorestreakLoadoutMessage,
  ShotMessage,
  WireAim,
  WireButtons,
  WireInput,
} from './wire/wireFormat.ts'
export {
  AFK_CLOSE_CODE,
  AFK_WARNING_MESSAGE,
  aimOnWire,
  BOUNDARY_DEATH_MESSAGE,
  CALLSIGN_MESSAGE,
  COSMETIC_LOADOUT_MESSAGE,
  decodeButtons,
  decodeMatchPhase,
  decodeMovementInput,
  decodeStance,
  decodeWeaponInput,
  dequantizeAim,
  dequantizePhaseLeft,
  dequantizePositionM,
  encodeButtons,
  encodeMatchPhase,
  encodeStance,
  isIdleWireInput,
  KILL_MESSAGE,
  LOADOUT_MESSAGE,
  MAP_VOTE_MESSAGE,
  MATCH_PHASES,
  MATCH_SUMMARY_MESSAGE,
  PAGE_RELOAD_CLOSE_CODE,
  PING_MS_MAX,
  PING_REPORT_INTERVAL_S,
  PING_REPORT_MESSAGE,
  PLAYER_IN_CONTROL_MESSAGE,
  PRIMARY_LOADOUT_MESSAGE,
  quantizeAim,
  quantizePhaseLeft,
  quantizePositionM,
  quantizeWish,
  SCORESTREAK_ACTIVATE_MESSAGE,
  SCORESTREAK_ACTIVATED_MESSAGE,
  SCORESTREAK_EARNED_MESSAGE,
  SCORESTREAK_LOADOUT_MESSAGE,
  SHOT_MESSAGE,
  wishOnWire,
} from './wire/wireFormat.ts'
