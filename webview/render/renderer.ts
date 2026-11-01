// Scene + HUD renderer. Pure drawing: it reads GameState and never mutates it.
import { CONFIG } from '../game/config';
import { rotLevel } from '../game/difficulty';
import { isAirborne, isSliding, playerX } from '../game/player';
import type { Coin, GameState, Obstacle } from '../game/types';
import { CAMERA, pixelsPerUnit, project, type Viewport } from './projection';
import {
  OBSTACLE_GEOM,
  PALETTE,
  SPRITE_GEOM,
  drawCoin,
  drawObstacle,
  drawShadow,
  drawTrain,
} from './sprites';
import { STRIDE_K, drawPlayer, runPose } from './player';

export interface RenderOptions {
  width: number; // CSS pixels
  height: number; // CSS pixels
  /** Informational: the caller already scales the context by dpr. */
  dpr: number;
  reducedMotion: boolean;
  best: number;
  realTime: number; // seconds, for idle animations
}

const ROW_LEN = 4; // world units per checkerboard row
const TRACK_NEAR_Z = -CAMERA.FOCAL + 1; // closest visible track, just in front of the camera
const COIN_LIFT = 0.6; // coin centre height above its stored y
const CRASH_FLASH_TIME = 0.45;
const CRASH_SHAKE_TIME = 0.8;

interface Shape {
  x: number; // 0..1 across the width
  y: number; // 0..1 of the horizon height
  size: number; // fraction of viewport height
  layer: 0 | 1 | 2; // 0 = far, 2 = near (scrolls faster)
  kind: 0 | 1 | 2; // 0 circle, 1 triangle, 2 zigzag
  color: string;
  phase: number;
}

const LAYER_SPEED = [0.25, 0.6, 1.1]; // px of parallax per world unit travelled
const SHAPE_COLORS = [
  PALETTE.hotPink,
  PALETTE.cyan,
  PALETTE.yellow,
  PALETTE.electricPurple,
  PALETTE.acidGreen,
];

/** Background shapes, generated once with a tiny fixed-seed PRNG so the layout is stable. */
const SHAPES: readonly Shape[] = (() => {
  let s = 0x2f6e3b;
  const rnd = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  const out: Shape[] = [];
  for (let i = 0; i < 18; i++) {
    const layer = (i % 3) as 0 | 1 | 2;
    out.push({
      x: rnd(),
      y: 0.15 + rnd() * 0.8,
      size: 0.03 + rnd() * 0.07 * (layer + 1) * 0.5,
      layer,
      kind: Math.floor(rnd() * 3) as 0 | 1 | 2,
      color: SHAPE_COLORS[Math.floor(rnd() * SHAPE_COLORS.length)],
      phase: rnd() * Math.PI * 2,
    });
  }
  return out;
})();

/** Reused every frame to avoid allocating a new array; sorted once per frame. */
const drawList: (Obstacle | Coin)[] = [];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const GREEN_RGB = hexToRgb(PALETTE.acidGreen);
const RED_RGB = hexToRgb(PALETTE.red);

/** Meter colour: acid green at low speed shifting to red at max speed. */
function meterColor(level: number): string {
  const r = Math.round(GREEN_RGB[0] + (RED_RGB[0] - GREEN_RGB[0]) * level);
  const g = Math.round(GREEN_RGB[1] + (RED_RGB[1] - GREEN_RGB[1]) * level);
  const b = Math.round(GREEN_RGB[2] + (RED_RGB[2] - GREEN_RGB[2]) * level);
  return `rgb(${r}, ${g}, ${b})`;
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizonY: number,
  scroll: number,
  realTime: number,
  reducedMotion: boolean,
): void {
  // Sky.
  const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
  sky.addColorStop(0, PALETTE.skyTop);
  sky.addColorStop(0.6, PALETTE.skyMid);
  sky.addColorStop(1, PALETTE.skyLow);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizonY + 1);

  // Retro sun with horizontal slices, sitting on the horizon.
  const sunR = Math.min(w, h) * 0.16;
  const sunX = w / 2;
  const sunY = horizonY - sunR * 0.35;
  const sunGrad = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
  sunGrad.addColorStop(0, PALETTE.yellow);
  sunGrad.addColorStop(1, PALETTE.hotPink);
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.skyMid;
  for (let i = 0; i < 4; i++) {
    const bandY = sunY + sunR * (0.05 + i * 0.22);
    ctx.fillRect(sunX - sunR, bandY, sunR * 2, Math.max(1, sunR * (0.02 + i * 0.025)));
  }

  // Parallax shapes drift at three speeds; they follow the distance travelled.
  const margin = h * 0.2;
  const span = w + margin * 2;
  ctx.save();
  for (const s of SHAPES) {
    const speed = LAYER_SPEED[s.layer];
    let x = (s.x * w - scroll * speed) % span;
    if (x < 0) x += span;
    x -= margin;
    const r = s.size * h;
    const bob = reducedMotion ? 0 : Math.sin(realTime * 0.6 + s.phase) * 3 * (s.layer + 1);
    const y = s.y * horizonY + bob;
    ctx.globalAlpha = 0.2 + 0.1 * s.layer;
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.color;
    ctx.beginPath();
    if (s.kind === 0) {
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.kind === 1) {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r * 0.8);
      ctx.lineTo(x - r, y + r * 0.8);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.lineWidth = Math.max(2, r * 0.22);
      ctx.moveTo(x - r, y);
      for (let i = 1; i <= 4; i++) {
        ctx.lineTo(x - r + i * r * 0.5, y + (i % 2 ? -r * 0.45 : r * 0.45));
      }
      ctx.stroke();
    }
  }
  ctx.restore();

  // Ground and a neon horizon line.
  ctx.fillStyle = PALETTE.groundDark;
  ctx.fillRect(0, horizonY, w, h - horizonY);
  ctx.fillStyle = PALETTE.hotPink;
  ctx.fillRect(0, horizonY - 1, w, 2);
}

function drawTrack(ctx: CanvasRenderingContext2D, vp: Viewport, scroll: number): void {
  // Checker boundaries sit at z = j * ROW_LEN - frac; their absolute parity comes from `a`.
  const frac = ((scroll % ROW_LEN) + ROW_LEN) % ROW_LEN;
  const base = Math.floor(scroll / ROW_LEN);
  const half = 0.5; // six checker columns across the track (lane units)

  for (let j = -1; ; j++) {
    const zN = j * ROW_LEN - frac;
    if (zN > CONFIG.SPAWN_DISTANCE) break;
    const zF = zN + ROW_LEN;
    if (zF < TRACK_NEAR_Z) continue;
    const a = j + base;
    for (let c = 0; c < 6; c++) {
      const xl = -1.5 + c * half;
      const xr = xl + half;
      const p1 = project(xl, 0, zN, vp);
      const p2 = project(xr, 0, zN, vp);
      const p3 = project(xr, 0, zF, vp);
      const p4 = project(xl, 0, zF, vp);
      ctx.fillStyle = (a + c) & 1 ? PALETTE.checkerB : PALETTE.checkerA;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Lane dividers and neon edges.
  const line = (laneX: number, color: string, width: number): void => {
    const a = project(laneX, 0, TRACK_NEAR_Z, vp);
    const b = project(laneX, 0, CONFIG.SPAWN_DISTANCE, vp);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };
  line(-0.5, 'rgba(255, 46, 154, 0.55)', 2);
  line(0.5, 'rgba(255, 46, 154, 0.55)', 2);
  line(-1.5, PALETTE.cyan, 3);
  line(1.5, PALETTE.cyan, 3);
}

/** Depth of the end of an item closest to the camera, used for draw ordering. */
function nearEnd(item: Obstacle | Coin): number {
  return 'kind' in item ? item.z - item.depth / 2 : item.z;
}

function drawItem(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  ppu: number,
  item: Obstacle | Coin,
  t: number,
): void {
  if ('kind' in item) {
    if (item.kind === 'block' || item.kind === 'moving') {
      const half = item.depth / 2;
      drawTrain(ctx, vp, ppu, item.lane, item.z - half, item.z + half, item.kind, t, TRACK_NEAR_Z);
      return;
    }
    const geom = OBSTACLE_GEOM[item.kind];
    const ground = project(item.lane, 0, item.z, vp);
    const p = project(item.lane, geom.bottom, item.z, vp);
    const k = p.scale * ppu;
    if (geom.bottom === 0) {
      drawShadow(ctx, ground.x, ground.y, (geom.width * k) / 2, 0.35);
    }
    drawObstacle(ctx, item.kind, p.x, p.y, k, t);
  } else {
    const p = project(item.lane, item.y + COIN_LIFT, item.z, vp);
    drawCoin(ctx, p.x, p.y, p.scale * ppu, t);
  }
}

function drawPlayerAndShadow(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  vp: Viewport,
  ppu: number,
  realTime: number,
  reducedMotion: boolean,
  scroll: number,
): void {
  const pl = state.player;
  const x = playerX(pl);
  const ground = project(x, 0, 0, vp);
  const k = ppu;
  const lift = Math.min(1, pl.y / CONFIG.JUMP_HEIGHT);
  const sliding = isSliding(pl);
  const airborne = isAirborne(pl);
  const phase = scroll * STRIDE_K;
  // The shadow shrinks slightly as the body bobs up.
  const bob = runPose(phase, { airborne, sliding, reducedMotion }).bob;
  const pulse = 1 - bob * 1.2;
  drawShadow(
    ctx,
    ground.x,
    ground.y,
    SPRITE_GEOM.player.width * 0.5 * k * pulse,
    0.4 * (1 - 0.6 * lift) * pulse,
  );
  const feet = project(x, pl.y, 0, vp);
  drawPlayer(ctx, feet.x, feet.y, k, {
    sliding,
    airborne,
    t: realTime,
    phase,
    reducedMotion,
  });
}

function drawHud(ctx: CanvasRenderingContext2D, state: GameState, opts: RenderOptions): void {
  const { width: w, height: h } = opts;
  const best = Math.max(opts.best, state.score);
  const small = Math.min(Math.max(h * 0.035, 12), 20);
  const big = Math.min(Math.max(h * 0.085, 28), 60);
  const font = (size: number, weight = 800): string =>
    `${weight} ${size}px "Trebuchet MS", system-ui, sans-serif`;

  ctx.textBaseline = 'top';
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.white;
  ctx.font = font(small);
  ctx.fillText(`BEST ${best}`, w - 16, 14);

  if (state.phase === 'title') return;

  // Score, brain cells and multiplier, top-left.
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.white;
  ctx.font = font(big, 900);
  ctx.fillText(String(state.score), 16, 10);
  ctx.font = font(small);
  ctx.fillStyle = PALETTE.hotPink;
  const coinY = 10 + big * 1.15;
  ctx.beginPath();
  ctx.arc(16 + small * 0.4, coinY + small * 0.55, small * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.white;
  ctx.fillText(`${state.coins}`, 16 + small * 1.1, coinY);
  ctx.fillStyle = PALETTE.yellow;
  ctx.fillText(`x${state.multiplier}`, 16 + small * 1.1 + small * 2.6, coinY);

  // Rot level meter, top-centre.
  const level = rotLevel(state.speed);
  const meterW = Math.min(260, Math.max(120, w * 0.22));
  const meterH = Math.max(10, small * 0.7);
  const mx = (w - meterW) / 2;
  const my = 16 + small * 1.4;
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.white;
  ctx.font = font(Math.max(10, small * 0.75));
  ctx.fillText('ROT LEVEL', w / 2, 14);
  ctx.fillStyle = 'rgba(20, 3, 42, 0.7)';
  ctx.fillRect(mx - 2, my - 2, meterW + 4, meterH + 4);
  ctx.fillStyle = meterColor(level);
  ctx.fillRect(mx, my, meterW * level, meterH);
  ctx.strokeStyle = PALETTE.cyan;
  ctx.lineWidth = 1;
  ctx.strokeRect(mx - 2, my - 2, meterW + 4, meterH + 4);

  if (state.phase === 'running') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255, 248, 255, 0.75)';
    ctx.font = font(small * 0.9, 700);
    ctx.fillText('P to pause', w / 2, h - 10);
  }
}

/**
 * Draws one frame: clear, scene (sky, track, objects far to near, player), crash effects, HUD.
 * Expects the context to already be scaled by dpr.
 */
export function render(ctx: CanvasRenderingContext2D, state: GameState, opts: RenderOptions): void {
  const { width: w, height: h } = opts;
  if (w <= 0 || h <= 0) return;
  const vp: Viewport = { width: w, height: h };
  const ppu = pixelsPerUnit(vp);
  const horizonY = h * CAMERA.HORIZON_RATIO;
  // The title screen has no run, so the scene idles forward using real time.
  const scroll = state.phase === 'title' ? opts.realTime * 14 : state.distance;
  const crashing = state.phase === 'crashed' || state.phase === 'gameover';
  const shaking = state.phase === 'crashed' && !opts.reducedMotion;

  ctx.save();
  ctx.fillStyle = PALETTE.groundDark;
  ctx.fillRect(0, 0, w, h);

  if (shaking) {
    const decay = Math.max(0, 1 - state.crashT / CRASH_SHAKE_TIME);
    const amp = Math.min(w, h) * 0.02 * decay;
    ctx.translate(Math.sin(state.crashT * 55) * amp, Math.cos(state.crashT * 43) * amp * 0.6);
  }

  drawBackground(ctx, w, h, horizonY, scroll, opts.realTime, opts.reducedMotion);
  drawTrack(ctx, vp, scroll);

  // Objects far to near by their near end (z - depth / 2; coins use z). Items whose near end is in
  // front of the player (> 0) are drawn before the player, the rest after it. Trains are visible
  // until their tail passes DESPAWN_Z.
  drawList.length = 0;
  for (const o of state.obstacles) {
    if (o.z + o.depth / 2 >= CONFIG.DESPAWN_Z && o.z - o.depth / 2 <= CONFIG.SPAWN_DISTANCE) {
      drawList.push(o);
    }
  }
  for (const c of state.coinsList) {
    if (!c.collected && c.z >= CONFIG.DESPAWN_Z && c.z <= CONFIG.SPAWN_DISTANCE) drawList.push(c);
  }
  drawList.sort((a, b) => nearEnd(b) - nearEnd(a));
  let split = drawList.findIndex((item) => nearEnd(item) <= 0);
  if (split < 0) split = drawList.length;

  for (let i = 0; i < split; i++) drawItem(ctx, vp, ppu, drawList[i], opts.realTime);
  drawPlayerAndShadow(ctx, state, vp, ppu, opts.realTime, opts.reducedMotion, scroll);
  for (let i = split; i < drawList.length; i++) drawItem(ctx, vp, ppu, drawList[i], opts.realTime);

  if (crashing && !opts.reducedMotion) {
    const alpha = Math.max(0, 1 - state.crashT / CRASH_FLASH_TIME) * 0.55;
    if (alpha > 0) {
      ctx.fillStyle = `rgba(255, 46, 154, ${alpha.toFixed(3)})`;
      ctx.fillRect(-20, -20, w + 40, h + 40);
    }
  }

  ctx.restore();

  // HUD is drawn without the shake transform so it stays readable.
  ctx.save();
  drawHud(ctx, state, opts);
  ctx.restore();
}
