// Procedurally drawn original characters, obstacles and collectibles (Canvas 2D only).
//
// Conventions: every draw helper takes a screen anchor (x, y) and `scale`, which is the number
// of pixels per world unit at that depth (projection scale * pixelsPerUnit(viewport)). Sprites
// are drawn in world-unit geometry multiplied by `scale`. `y` grows downwards on screen.
import type { ObstacleKind } from '../game/types';
import { CAMERA, project, type Viewport } from './projection';

export const PALETTE = {
  hotPink: '#ff2e9a',
  acidGreen: '#b6ff2e',
  electricPurple: '#8b3dff',
  cyan: '#22f0ff',
  yellow: '#ffe83d',
  red: '#ff2a4d',
  ink: '#14032a',
  white: '#fff8ff',
  skyTop: '#12002a',
  skyMid: '#3a0a62',
  skyLow: '#7a1470',
  groundDark: '#1a0633',
  checkerA: '#23083f',
  checkerB: '#331058',
  brickPurple: '#6a2bd9',
  brickShade: '#4a1a9e',
} as const;

/** Sprite geometry in world units. `bottom` is the height of the sprite's lowest point. */
export const SPRITE_GEOM = {
  player: { width: 1.2, height: 1.3, slideHeight: 0.62 },
  low: { bottom: 0, height: 0.6, width: 1.9 },
  high: { bottom: 1.0, height: 0.9, width: 2.0 },
  block: { bottom: 0, height: 2.3, width: 1.8 },
  moving: { bottom: 0, height: 2.3, width: 1.8 },
  coin: { radius: 0.28 },
} as const;

export const OBSTACLE_GEOM: Record<
  ObstacleKind,
  { bottom: number; height: number; width: number }
> = {
  low: SPRITE_GEOM.low,
  high: SPRITE_GEOM.high,
  block: SPRITE_GEOM.block,
  moving: SPRITE_GEOM.moving,
};

/** Soft elliptical ground shadow, no gradients so it stays cheap. */
export function drawShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusPx: number,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(1, radiusPx), Math.max(1, radiusPx * 0.28), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Low barrier with hazard stripes and a glowing phone screen on top. (x, y) is the base centre. */
function drawFence(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  k: number,
  t: number,
): void {
  const g = SPRITE_GEOM.low;
  const w = g.width * k;
  const h = g.height * k;
  const left = x - w / 2;
  const top = y - h;

  // Posts.
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(left + w * 0.04, top, w * 0.07, h);
  ctx.fillRect(left + w * 0.89, top, w * 0.07, h);

  // Striped barrier.
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top + h * 0.3, w, h * 0.5);
  ctx.clip();
  ctx.fillStyle = PALETTE.yellow;
  ctx.fillRect(left, top + h * 0.3, w, h * 0.5);
  ctx.fillStyle = PALETTE.hotPink;
  const stripe = Math.max(4, h * 0.35);
  for (let sx = left - stripe * 2; sx < left + w + stripe; sx += stripe * 2) {
    ctx.beginPath();
    ctx.moveTo(sx, top + h * 0.8);
    ctx.lineTo(sx + stripe, top + h * 0.3);
    ctx.lineTo(sx + stripe * 1.5, top + h * 0.3);
    ctx.lineTo(sx + stripe * 0.5, top + h * 0.8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Phone screen glowing on the fence top, with a scrolling feed line.
  const pw = w * 0.34;
  const ph = h * 0.5;
  const px = x - pw / 2;
  const py = top - ph * 0.7;
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(px - w * 0.02, py - w * 0.02, pw + w * 0.04, ph + w * 0.04);
  ctx.fillStyle = PALETTE.cyan;
  ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = PALETTE.white;
  const scroll = (t * 3) % 1;
  for (let i = 0; i < 3; i++) {
    const ly = py + ph * (0.2 + ((i + scroll) % 3) * 0.28);
    ctx.fillRect(px + pw * 0.15, ly, pw * 0.7, Math.max(1, ph * 0.08));
  }
}

/** Overhead banner on two poles. (x, y) is the banner's bottom centre. */
function drawBanner(ctx: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  const g = SPRITE_GEOM.high;
  const w = g.width * k;
  const h = g.height * k;
  const top = y - h;
  const left = x - w / 2;

  // Poles run from the banner bottom down to the ground.
  const groundY = y + g.bottom * k;
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(left + w * 0.02, y, w * 0.06, groundY - y);
  ctx.fillRect(left + w * 0.92, y, w * 0.06, groundY - y);

  // Banner.
  ctx.fillStyle = PALETTE.hotPink;
  ctx.fillRect(left, top, w, h);
  ctx.fillStyle = PALETTE.yellow;
  ctx.fillRect(left + w * 0.04, top + h * 0.08, w * 0.92, h * 0.84);
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `900 ${Math.max(8, h * 0.52)}px "Trebuchet MS", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RATIO', x, top + h / 2 + h * 0.02);
}

const TRAIN_STYLES = {
  // Parked Train: purple livery with a cringing face on the front.
  block: {
    front: PALETTE.brickPurple,
    side: PALETTE.brickShade,
    top: '#9a66ff',
    edge: PALETTE.acidGreen,
    window: PALETTE.ink,
  },
  // Sigma Express: pink livery with headlights and a destination sign.
  moving: {
    front: PALETTE.hotPink,
    side: '#b3186b',
    top: '#ff8cc6',
    edge: PALETTE.cyan,
    window: PALETTE.yellow,
  },
} as const;

export type TrainKind = keyof typeof TRAIN_STYLES;
type Pt = { x: number; y: number };

const CAR_LENGTH = 5; // world units per car, used for gap lines and windows

function fillPoly(
  ctx: CanvasRenderingContext2D,
  pts: readonly Pt[],
  fill: string,
  stroke: string | null,
  lineWidth: number,
): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

/**
 * A train as a shaded 3D box spanning world depth [zNear, zFar] in a lane. Faces are painted back
 * to front: the side that faces the screen centre (none for the centre lane), the top, then the
 * front. `clipZ` is the nearest depth that may be projected; a box crossing it is cut there.
 */
export function drawTrain(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  ppu: number,
  lane: number,
  zNear: number,
  zFar: number,
  style: TrainKind,
  t: number,
  clipZ: number,
): void {
  if (zFar <= clipZ) return;
  const g = SPRITE_GEOM[style];
  const st = TRAIN_STYLES[style];
  const half = g.width / 2 / CAMERA.LANE_WIDTH; // project() takes lane units
  const xl = lane - half;
  const xr = lane + half;
  const h = g.height;
  const zN = Math.max(zNear, clipZ);
  const frontVisible = zNear >= clipZ;
  const pr = (x: number, y: number, z: number): Pt => project(x, y, z, vp);

  const kFront = project(lane, 0, zN, vp).scale * ppu;
  const edgeW = Math.max(1.5, 0.06 * kFront);
  // Car layout comes from the full length so it stays put while the box is clipped.
  const cars = Math.max(1, Math.round((zFar - zNear) / CAR_LENGTH));
  const carLen = (zFar - zNear) / cars;

  // Side face towards the screen centre.
  if (lane !== 0) {
    const sx = lane < 0 ? xr : xl;
    const side = (z: number, y: number): Pt => pr(sx, y, z);
    fillPoly(
      ctx,
      [side(zN, 0), side(zFar, 0), side(zFar, h), side(zN, h)],
      st.side,
      st.edge,
      edgeW,
    );

    for (let c = 0; c < cars; c++) {
      const z0 = zNear + c * carLen;
      // Gap line between cars.
      if (c > 0 && z0 > zN) {
        const a = side(z0, 0);
        const b = side(z0, h);
        ctx.strokeStyle = st.edge;
        ctx.lineWidth = Math.max(1, edgeW * 0.6);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      // Three windows per car.
      for (let i = 0; i < 3; i++) {
        const wa = Math.max(z0 + carLen * (0.1 + i * 0.28), zN);
        const wb = z0 + carLen * (0.31 + i * 0.28);
        if (wb <= zN) continue;
        fillPoly(
          ctx,
          [side(wa, h * 0.52), side(wb, h * 0.52), side(wb, h * 0.84), side(wa, h * 0.84)],
          st.window,
          null,
          0,
        );
      }
      // Two bogies (dark wheel sets) at the base of the car.
      for (const u of [0.2, 0.8]) {
        const z = z0 + carLen * u;
        if (z < zN) continue;
        const mid = side(z, 0.22);
        const a = side(z - 0.5, 0.22);
        const b = side(z + 0.5, 0.22);
        const rx = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y) / 2);
        ctx.fillStyle = PALETTE.ink;
        ctx.beginPath();
        ctx.ellipse(mid.x, mid.y, rx, 0.22 * project(sx, 0, z, vp).scale * ppu, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Top face, lighter, with a gap line across it per car boundary.
  fillPoly(
    ctx,
    [pr(xl, h, zN), pr(xr, h, zN), pr(xr, h, zFar), pr(xl, h, zFar)],
    st.top,
    st.edge,
    edgeW,
  );
  ctx.strokeStyle = st.edge;
  ctx.lineWidth = Math.max(1, edgeW * 0.6);
  for (let c = 1; c < cars; c++) {
    const z = zNear + c * carLen;
    if (z <= zN) continue;
    const a = pr(xl, h, z);
    const b = pr(xr, h, z);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // A clipped box has no front face: its real front is behind the camera.
  if (!frontVisible) return;

  // Front face at full colour.
  const bl = pr(xl, 0, zN);
  const tr = pr(xr, h, zN);
  const fw = tr.x - bl.x;
  const fh = bl.y - tr.y;
  const cx = (bl.x + tr.x) / 2;
  ctx.fillStyle = st.front;
  ctx.fillRect(bl.x, tr.y, fw, fh);
  ctx.strokeStyle = st.edge;
  ctx.lineWidth = edgeW;
  ctx.strokeRect(bl.x, tr.y, fw, fh);

  if (style === 'block') {
    // Cringe face: squinting eyes and a wobbly mouth.
    const fy = tr.y + fh * 0.38;
    ctx.strokeStyle = PALETTE.white;
    ctx.lineWidth = Math.max(2, 0.07 * kFront);
    ctx.beginPath();
    ctx.moveTo(cx - fw * 0.3, fy - fh * 0.04);
    ctx.lineTo(cx - fw * 0.1, fy + fh * 0.02);
    ctx.moveTo(cx + fw * 0.3, fy - fh * 0.04);
    ctx.lineTo(cx + fw * 0.1, fy + fh * 0.02);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - fw * 0.28, fy + fh * 0.2);
    ctx.quadraticCurveTo(cx - fw * 0.14, fy + fh * 0.12, cx, fy + fh * 0.2);
    ctx.quadraticCurveTo(cx + fw * 0.14, fy + fh * 0.28, cx + fw * 0.28, fy + fh * 0.2);
    ctx.stroke();
    return;
  }

  // Flickering destination sign above the windscreen.
  const flicker = Math.sin(t * 23) > -0.6 || Math.sin(t * 7) > 0.8;
  const signH = fh * 0.16;
  const signY = tr.y + fh * 0.1;
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(cx - fw * 0.32, signY, fw * 0.64, signH);
  if (flicker) {
    ctx.fillStyle = PALETTE.acidGreen;
    ctx.font = `900 ${Math.max(6, signH * 0.75)}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SIGMA', cx, signY + signH / 2);
  }

  // Headlights: two bright discs with a pale halo (no shadowBlur).
  const lampR = fh * 0.07;
  for (const sd of [-1, 1]) {
    const hx = cx + sd * fw * 0.3;
    const hy = tr.y + fh * 0.7;
    ctx.fillStyle = 'rgba(255, 232, 61, 0.35)';
    ctx.beginPath();
    ctx.arc(hx, hy, lampR * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.yellow;
    ctx.beginPath();
    ctx.arc(hx, hy, lampR, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draws an obstacle. (x, y) is the screen point at the sprite's `bottom` height, see OBSTACLE_GEOM. */
export function drawObstacle(
  ctx: CanvasRenderingContext2D,
  kind: ObstacleKind,
  x: number,
  y: number,
  scale: number,
  t: number,
): void {
  ctx.save();
  switch (kind) {
    case 'low':
      drawFence(ctx, x, y, scale, t);
      break;
    case 'high':
      drawBanner(ctx, x, y, scale);
      break;
    case 'block':
    case 'moving':
      break; // trains are 3D boxes, see drawTrain
  }
  ctx.restore();
}

/** Spinning brain cell: a pink and yellow disc whose width follows a cosine spin. (x, y) is the centre. */
export function drawCoin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  t: number,
): void {
  const r = SPRITE_GEOM.coin.radius * scale;
  const spin = Math.abs(Math.cos(t * 5));
  const rx = Math.max(r * 0.15, r * spin);
  ctx.save();
  ctx.fillStyle = PALETTE.hotPink;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.yellow;
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 0.55, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
