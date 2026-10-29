// All tunable gameplay constants. Pure TypeScript, no DOM.
export const CONFIG = {
  LANES: [-1, 0, 1] as const,
  BASE_SPEED: 12, // world units per second at start
  MAX_SPEED: 45, // speed cap
  // Tuned from 0.04 so that MAX_SPEED is reached at ~270 s (see difficulty.test.ts):
  // speed(t) = BASE * (1 + G * t^E) hits MAX (=3.75x BASE) when G * t^E = 2.75.
  SPEED_GROWTH: 0.0236,
  SPEED_EXP: 0.85,
  LANE_SWITCH_TIME: 0.12, // seconds for a lane tween
  JUMP_DURATION: 0.6, // seconds
  JUMP_HEIGHT: 1.6, // world units at jump apex
  SLIDE_DURATION: 0.6, // seconds
  INPUT_BUFFER: 0.15, // seconds an unapplied action is remembered
  SPAWN_DISTANCE: 120, // z where rows spawn
  DESPAWN_Z: -5, // z where objects are removed
  MIN_GAP_TIME: 0.55, // seconds of reaction between rows at any speed (floor)
  BASE_GAP: 28, // world units between rows at start
  COIN_VALUE: 10,
  MULTIPLIER_INTERVAL: 30, // seconds per multiplier step
  MAX_MULTIPLIER: 5,
  TIER2_TIME: 30,
  TIER3_TIME: 60,
  MOVING_EXTRA_SPEED: 8, // Sigma Cart speed above track speed
  PLAYER_HALF_DEPTH: 0.6,
  FIXED_DT: 1 / 120,
};
