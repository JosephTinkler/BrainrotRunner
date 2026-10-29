import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../webview/game/config';
import { applyAction, isAirborne, isSliding, playerX, stepPlayer } from '../../webview/game/player';
import type { PlayerState } from '../../webview/game/types';

const start = (): PlayerState => ({
  lane: 0,
  fromLane: 0,
  laneT: 1,
  y: 0,
  jumpT: -1,
  slideT: -1,
});

describe('lane changes', () => {
  it('moves one lane left or right', () => {
    const left = applyAction(start(), 'left');
    expect(left?.lane).toBe(-1);
    expect(left?.fromLane).toBe(0);
    expect(left?.laneT).toBe(0);

    const right = applyAction(start(), 'right');
    expect(right?.lane).toBe(1);
  });

  it('clamps at the edges and consumes the action unchanged', () => {
    const atLeft: PlayerState = { ...start(), lane: -1, fromLane: -1 };
    expect(applyAction(atLeft, 'left')).toBe(atLeft);

    const atRight: PlayerState = { ...start(), lane: 1, fromLane: 1 };
    expect(applyAction(atRight, 'right')).toBe(atRight);
    expect(applyAction(atRight, 'left')?.lane).toBe(0);
  });

  it('returns null while a lane tween is in progress so the action stays buffered', () => {
    const tweening = applyAction(start(), 'right') as PlayerState;
    expect(applyAction(tweening, 'left')).toBeNull();
  });

  it('finishes the tween after LANE_SWITCH_TIME', () => {
    const moved = applyAction(start(), 'right') as PlayerState;
    const half = stepPlayer(moved, CONFIG.LANE_SWITCH_TIME / 2);
    expect(half.laneT).toBeGreaterThan(0);
    expect(half.laneT).toBeLessThan(1);
    expect(playerX(half)).toBeGreaterThan(0);
    expect(playerX(half)).toBeLessThan(1);

    const done = stepPlayer(moved, CONFIG.LANE_SWITCH_TIME);
    expect(done.laneT).toBe(1);
    expect(playerX(done)).toBe(1);
  });
});

describe('jump', () => {
  it('starts a jump and rises', () => {
    const j = applyAction(start(), 'jump') as PlayerState;
    expect(isAirborne(j)).toBe(true);
    const mid = stepPlayer(j, CONFIG.JUMP_DURATION / 2);
    expect(mid.y).toBeCloseTo(CONFIG.JUMP_HEIGHT, 6);
  });

  it('returns to y = 0 and grounded after JUMP_DURATION', () => {
    const j = applyAction(start(), 'jump') as PlayerState;
    const landed = stepPlayer(j, CONFIG.JUMP_DURATION);
    expect(landed.y).toBe(0);
    expect(landed.jumpT).toBe(-1);
    expect(isAirborne(landed)).toBe(false);
  });

  it('cannot jump while airborne (action is buffered)', () => {
    const j = applyAction(start(), 'jump') as PlayerState;
    expect(applyAction(j, 'jump')).toBeNull();
  });

  it('cancels a slide and jumps', () => {
    const sliding = applyAction(start(), 'slide') as PlayerState;
    const j = applyAction(sliding, 'jump') as PlayerState;
    expect(isSliding(j)).toBe(false);
    expect(isAirborne(j)).toBe(true);
  });
});

describe('slide', () => {
  it('starts a slide that ends after SLIDE_DURATION', () => {
    const s = applyAction(start(), 'slide') as PlayerState;
    expect(isSliding(s)).toBe(true);
    const still = stepPlayer(s, CONFIG.SLIDE_DURATION / 2);
    expect(isSliding(still)).toBe(true);
    const ended = stepPlayer(s, CONFIG.SLIDE_DURATION);
    expect(isSliding(ended)).toBe(false);
    expect(ended.slideT).toBe(-1);
  });

  it('sliding again while already sliding is consumed unchanged', () => {
    const s = applyAction(start(), 'slide') as PlayerState;
    expect(applyAction(s, 'slide')).toBe(s);
  });

  it('slide while airborne is a fast fall: ends the jump and starts sliding', () => {
    const j = stepPlayer(applyAction(start(), 'jump') as PlayerState, 0.2);
    expect(j.y).toBeGreaterThan(0);
    const fall = applyAction(j, 'slide') as PlayerState;
    expect(fall.y).toBe(0);
    expect(fall.jumpT).toBe(-1);
    expect(isAirborne(fall)).toBe(false);
    expect(isSliding(fall)).toBe(true);
  });
});
