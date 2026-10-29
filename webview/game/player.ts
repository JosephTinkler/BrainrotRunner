import { CONFIG } from './config';
import type { InputAction, Lane, PlayerState } from './types';

export function isAirborne(p: PlayerState): boolean {
  return p.jumpT >= 0;
}

export function isSliding(p: PlayerState): boolean {
  return p.slideT >= 0;
}

/** Interpolated lane position (fromLane..lane, eased by laneT). */
export function playerX(p: PlayerState): number {
  const t = Math.min(1, Math.max(0, p.laneT));
  const e = t * t * (3 - 2 * t); // smoothstep
  return p.fromLane + (p.lane - p.fromLane) * e;
}

/**
 * Applies an input action. Returns:
 * - a new state if the action took effect,
 * - the same object if the action is consumed with no effect (e.g. lane change at the edge),
 * - null if it cannot be applied right now and should stay buffered.
 */
export function applyAction(p: PlayerState, a: InputAction): PlayerState | null {
  switch (a) {
    case 'left':
    case 'right': {
      if (p.laneT < 1) return null; // finish the current tween first
      const target = p.lane + (a === 'left' ? -1 : 1);
      if (target < -1 || target > 1) return p; // at the edge: consumed, no change
      return { ...p, fromLane: p.lane, lane: target as Lane, laneT: 0 };
    }
    case 'jump': {
      if (isAirborne(p)) return null;
      // Jumping while sliding cancels the slide.
      return { ...p, jumpT: 0, y: 0, slideT: -1 };
    }
    case 'slide': {
      if (isSliding(p)) return p;
      if (isAirborne(p)) {
        // Slide mid-air = fast fall: end the jump and start sliding.
        return { ...p, jumpT: -1, y: 0, slideT: 0 };
      }
      return { ...p, slideT: 0 };
    }
  }
}

/** Advances lane tween, jump arc and slide timer by dt seconds. Returns a new state. */
export function stepPlayer(p: PlayerState, dt: number): PlayerState {
  let laneT = p.laneT;
  if (laneT < 1) {
    laneT = Math.min(1, laneT + dt / CONFIG.LANE_SWITCH_TIME);
  }

  let jumpT = p.jumpT;
  let y = p.y;
  if (jumpT >= 0) {
    jumpT += dt;
    if (jumpT >= CONFIG.JUMP_DURATION) {
      jumpT = -1;
      y = 0;
    } else {
      const u = jumpT / CONFIG.JUMP_DURATION;
      y = 4 * CONFIG.JUMP_HEIGHT * u * (1 - u);
    }
  }

  let slideT = p.slideT;
  if (slideT >= 0) {
    slideT += dt;
    if (slideT >= CONFIG.SLIDE_DURATION) slideT = -1;
  }

  return { ...p, laneT, jumpT, y, slideT };
}
