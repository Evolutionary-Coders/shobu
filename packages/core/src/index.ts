export type { BoxHit } from './collision/raycastBoxes.ts'
export { createBoxHit, nearestBoxHit, raycastBoxes } from './collision/raycastBoxes.ts'
export { nearestTargetHit } from './collision/raycastTargets.ts'
export type { PlayerBox, StaticBox } from './collision/staticBox.ts'
export { boxFromCenterSize, overlaps, overlapsAny } from './collision/staticBox.ts'
export { hasHeadroom, subStepCount, sweepCharacter } from './collision/sweepCharacter.ts'
export type { TargetList, TargetSlot } from './collision/targetList.ts'
export { createTargetList, pushTarget, resetTargetList } from './collision/targetList.ts'
export type {
  CameraConfig,
  GameplayConfig,
  MatchConfig,
  MovementConfig,
  WeaponConfig,
} from './config/gameplayConfig.ts'
export { GAMEPLAY_CONFIG_SPEC } from './config/gameplayConfigSpec.ts'
export { parseGameplayConfig } from './config/parseGameplayConfig.ts'
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
export type { Medal, MedalRarity, MedalSlug } from './medals/medalCatalog.ts'
export { MEDAL_CATALOG, medalBySlug } from './medals/medalCatalog.ts'
export type { CharacterState, Stance } from './movement/characterState.ts'
export {
  copyCharacterState,
  createCharacterState,
  horizontalSpeed,
  JUMPS_PER_FLIGHT,
} from './movement/characterState.ts'
export { CROUCH_CAPSULE_RATIO } from './movement/crouch.ts'
export { maxDoubleJumpHeightM, maxJumpHeightM } from './movement/jump.ts'
export type { MovementInput } from './movement/movementInput.ts'
export { hasWish, IDLE_INPUT, wishLength, wishUnit } from './movement/movementInput.ts'
export { SLIDE_CAPSULE_RATIO, SLIDE_ENTRY_SPEED_RATIO } from './movement/slide.ts'
export { stepCharacter } from './movement/stepCharacter.ts'
export type { KillEvent, KillWeapon, MutableKillEvent } from './scoring/killEvent.ts'
export { createKillEvent } from './scoring/killEvent.ts'
export type { PlayerScore, Scoreboard } from './scoring/scoreboard.ts'
export {
  addPlayer,
  applyKill,
  createScoreboard,
  rankedScores,
  removePlayer,
} from './scoring/scoreboard.ts'
export type { FixedTickAccumulator } from './time/fixedTickAccumulator.ts'
export { consumeTicks, createFixedTickAccumulator } from './time/fixedTickAccumulator.ts'
export type { TrainingDummy } from './training/trainingDummy.ts'
export {
  collectLiveTargets,
  createTrainingDummy,
  killTrainingDummy,
  stepTrainingDummy,
} from './training/trainingDummy.ts'
export { applySpread } from './weapon/aimSpread.ts'
export type { ShotHit, ShotOrigin } from './weapon/resolveShot.ts'
export { createShotHit, resolveShot } from './weapon/resolveShot.ts'
export { spreadTangent } from './weapon/spreadTangent.ts'
export { stepWeapon } from './weapon/stepWeapon.ts'
export type { WeaponInput } from './weapon/weaponInput.ts'
export { IDLE_WEAPON_INPUT } from './weapon/weaponInput.ts'
export type { WeaponPhase, WeaponState } from './weapon/weaponState.ts'
export {
  canFire,
  copyWeaponState,
  createWeaponState,
  isExactShot,
  isReloading,
  weaponPhase,
} from './weapon/weaponState.ts'
