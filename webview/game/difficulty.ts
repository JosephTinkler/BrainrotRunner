import { CONFIG } from './config';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Track speed in world units/second at time t (seconds). Capped at MAX_SPEED. */
export function speedAt(t: number): number {
  if (t <= 0) return CONFIG.BASE_SPEED;
  const s = CONFIG.BASE_SPEED * (1 + CONFIG.SPEED_GROWTH * Math.pow(t, CONFIG.SPEED_EXP));
  return Math.min(CONFIG.MAX_SPEED, s);
}

export function tierAt(t: number): 1 | 2 | 3 {
  if (t >= CONFIG.TIER3_TIME) return 3;
  if (t >= CONFIG.TIER2_TIME) return 2;
  return 1;
}

/**
 * World distance between obstacle rows. Shrinks from BASE_GAP towards half of it as speed
 * approaches MAX_SPEED, but never below speed * MIN_GAP_TIME (the reaction-time floor).
 */
export function rowGap(speed: number): number {
  const s = Math.max(0, speed);
  const frac = clamp((s - CONFIG.BASE_SPEED) / (CONFIG.MAX_SPEED - CONFIG.BASE_SPEED), 0, 1);
  const shrunk = CONFIG.BASE_GAP * (1 - 0.5 * frac);
  return Math.max(s * CONFIG.MIN_GAP_TIME, shrunk);
}

export function multiplierAt(t: number): number {
  const steps = Math.floor(Math.max(0, t) / CONFIG.MULTIPLIER_INTERVAL);
  return Math.min(CONFIG.MAX_MULTIPLIER, 1 + steps);
}

/** Normalised 0..1 value for the HUD "rot level" meter. */
export function rotLevel(speed: number): number {
  return clamp(speed / CONFIG.MAX_SPEED, 0, 1);
}
