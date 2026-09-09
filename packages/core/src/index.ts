export type { PlayerBox, StaticBox } from './collision/staticBox.ts'
export { boxFromCenterSize, overlaps, overlapsAny } from './collision/staticBox.ts'
export { hasHeadroom, subStepCount, sweepCharacter } from './collision/sweepCharacter.ts'
export type { GameplayConfig } from './config/gameplayConfig.ts'
export { GAMEPLAY_CONFIG_SPEC } from './config/gameplayConfigSpec.ts'
export { parseGameplayConfig } from './config/parseGameplayConfig.ts'
export type { Vector3 } from './math/vector3.ts'
export { addScaled, clampLength, lengthSquared, scaleInPlace } from './math/vector3.ts'
export type { CharacterState, Stance } from './movement/characterState.ts'
export {
  copyCharacterState,
  createCharacterState,
  horizontalSpeed,
  JUMPS_PER_FLIGHT,
} from './movement/characterState.ts'
export { CROUCH_CAPSULE_RATIO } from './movement/crouch.ts'
export type { MovementInput } from './movement/movementInput.ts'
export { hasWish, IDLE_INPUT, wishLength, wishUnit } from './movement/movementInput.ts'
export { SLIDE_CAPSULE_RATIO, SLIDE_ENTRY_SPEED_RATIO } from './movement/slide.ts'
export { stepCharacter } from './movement/stepCharacter.ts'
export type { FixedTickAccumulator } from './time/fixedTickAccumulator.ts'
export { consumeTicks, createFixedTickAccumulator } from './time/fixedTickAccumulator.ts'
