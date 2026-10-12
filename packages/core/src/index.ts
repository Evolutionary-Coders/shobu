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
export { createBotPlayer, resetBotBody } from './bots/botPlayer.ts'
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
export type { BoxHit } from './collision/raycastBoxes.ts'
export { createBoxHit, nearestBoxHit, raycastBoxes } from './collision/raycastBoxes.ts'
export { nearestTargetHit } from './collision/raycastTargets.ts'
export type { PlayerBox, StaticBox } from './collision/staticBox.ts'
export { boxFromCenterSize, overlaps, overlapsAny } from './collision/staticBox.ts'
export { hasHeadroom, subStepCount, sweepCharacter } from './collision/sweepCharacter.ts'
export type { TargetList, TargetSlot } from './collision/targetList.ts'
export { createTargetList, pushTarget, resetTargetList } from './collision/targetList.ts'
export type {
  BotSkillConfig,
  BotsConfig,
  CameraConfig,
  GameplayConfig,
  GrappleConfig,
  MatchConfig,
  MeleeConfig,
  MovementConfig,
  WeaponConfig,
} from './config/gameplayConfig.ts'
export { GAMEPLAY_CONFIG_SPEC } from './config/gameplayConfigSpec.ts'
export { parseGameplayConfig } from './config/parseGameplayConfig.ts'
export type { Fighter } from './match/fighter.ts'
export {
  collectFighterTargets,
  eyeOf,
  killFighter,
  pickSpawn,
  stepRespawnClock,
} from './match/fighter.ts'
export type { FighterAim, ShotRange, SniperKillMoment } from './match/fighterShot.ts'
export { describeSniperKill, resolveFighterShot } from './match/fighterShot.ts'
export type {
  FighterStrike,
  MeleeKillMoment,
  StrikeRange,
} from './match/fighterStrike.ts'
export {
  describeMeleeKill,
  facingAwayDeg,
  resolveFighterStrike,
} from './match/fighterStrike.ts'
export type { BallotWindow, MapBallot, MapVoteOutcome } from './match/mapVote.ts'
export {
  ballotsCastBy,
  botBallots,
  castBallot,
  decideMapVote,
  mapVoteOptions,
  RANDOM_MAP_OPTION,
  tallyMapVote,
} from './match/mapVote.ts'
export { compareForMvp, finalStandings, pickMvp } from './match/matchMvp.ts'
export type { BoundaryClock, BoundaryStatus, PlayArea } from './match/playArea.ts'
export {
  boundaryRemainingS,
  createBoundaryClock,
  isInsidePlayArea,
  stepBoundary,
} from './match/playArea.ts'
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
  horizontalSpeed,
  JUMPS_PER_FLIGHT,
} from './movement/characterState.ts'
export { CROUCH_CAPSULE_RATIO } from './movement/crouch.ts'
export { findGrappleAnchor, grappleEyeM } from './movement/grapple.ts'
export { maxDoubleJumpHeightM, maxJumpHeightM } from './movement/jump.ts'
export type { MovementInput } from './movement/movementInput.ts'
export { hasWish, IDLE_INPUT, wishLength, wishUnit } from './movement/movementInput.ts'
export { SLIDE_CAPSULE_RATIO, SLIDE_ENTRY_SPEED_RATIO } from './movement/slide.ts'
export { stepCharacter } from './movement/stepCharacter.ts'
export { tacticalTankRatio } from './movement/tacticalSprint.ts'
export type { KillEvent, KillWeapon, MutableKillEvent } from './scoring/killEvent.ts'
export { createKillEvent, isHeadshotKill, isMeleeKill } from './scoring/killEvent.ts'
export { recordKill } from './scoring/recordKill.ts'
export type { PlayerScore, Scoreboard } from './scoring/scoreboard.ts'
export {
  addPlayer,
  applyBoundaryDeath,
  applyKill,
  createScoreboard,
  killsWithin,
  MULTIKILL_MEMORY,
  rankedScores,
  removePlayer,
  resetScoreboard,
} from './scoring/scoreboard.ts'
export type { FixedTickAccumulator } from './time/fixedTickAccumulator.ts'
export { consumeTicks, createFixedTickAccumulator } from './time/fixedTickAccumulator.ts'
export { applySpread } from './weapon/aimSpread.ts'
export { hitHeightRatio } from './weapon/hitHeight.ts'
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
