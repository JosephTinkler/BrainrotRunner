import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../webview/game/config';
import { multiplierAt, rotLevel, rowGap, speedAt, tierAt } from '../../webview/game/difficulty';

describe('speedAt', () => {
  it('starts at BASE_SPEED for t <= 0', () => {
    expect(speedAt(0)).toBe(CONFIG.BASE_SPEED);
    expect(speedAt(-5)).toBe(CONFIG.BASE_SPEED);
  });

  it('rises monotonically and never exceeds MAX_SPEED', () => {
    let prev = speedAt(0);
    for (let t = 0.5; t <= 1000; t += 0.5) {
      const s = speedAt(t);
      expect(s).toBeGreaterThanOrEqual(prev);
      expect(s).toBeLessThanOrEqual(CONFIG.MAX_SPEED);
      prev = s;
    }
  });

  it('reaches MAX_SPEED between 240 and 300 seconds', () => {
    expect(speedAt(240)).toBeLessThan(CONFIG.MAX_SPEED);
    expect(speedAt(300)).toBe(CONFIG.MAX_SPEED);
  });
});

describe('tierAt', () => {
  it('uses tier thresholds from CONFIG', () => {
    expect(tierAt(0)).toBe(1);
    expect(tierAt(CONFIG.TIER2_TIME - 0.1)).toBe(1);
    expect(tierAt(CONFIG.TIER2_TIME)).toBe(2);
    expect(tierAt(CONFIG.TIER3_TIME - 0.1)).toBe(2);
    expect(tierAt(CONFIG.TIER3_TIME)).toBe(3);
    expect(tierAt(10_000)).toBe(3);
  });
});

describe('rowGap', () => {
  it('is never less than speed * MIN_GAP_TIME for speeds 0..MAX', () => {
    for (let s = 0; s <= CONFIG.MAX_SPEED; s += 0.25) {
      expect(rowGap(s)).toBeGreaterThanOrEqual(s * CONFIG.MIN_GAP_TIME);
    }
  });

  it('starts at BASE_GAP and shrinks with speed', () => {
    expect(rowGap(CONFIG.BASE_SPEED)).toBe(CONFIG.BASE_GAP);
    expect(rowGap(CONFIG.MAX_SPEED)).toBeLessThan(rowGap(CONFIG.BASE_SPEED));
  });
});

describe('multiplierAt', () => {
  it('steps every MULTIPLIER_INTERVAL seconds and caps at MAX_MULTIPLIER', () => {
    expect(multiplierAt(0)).toBe(1);
    expect(multiplierAt(29.9)).toBe(1);
    expect(multiplierAt(30)).toBe(2);
    expect(multiplierAt(60)).toBe(3);
    expect(multiplierAt(120)).toBe(5);
    expect(multiplierAt(10_000)).toBe(CONFIG.MAX_MULTIPLIER);
  });
});

describe('rotLevel', () => {
  it('is normalised to 0..1', () => {
    expect(rotLevel(0)).toBe(0);
    expect(rotLevel(CONFIG.MAX_SPEED)).toBe(1);
    expect(rotLevel(CONFIG.MAX_SPEED * 2)).toBe(1);
    expect(rotLevel(-3)).toBe(0);
  });
});
