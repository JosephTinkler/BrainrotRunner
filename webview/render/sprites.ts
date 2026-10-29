// Procedurally drawn original characters, obstacles and collectibles (Canvas 2D only).
//
// Conventions: every draw helper takes a screen anchor (x, y) and `scale`, which is the number
// of pixels per world unit at that depth (projection scale * pixelsPerUnit(viewport)). Sprites
// are drawn in world-unit geometry multiplied by `scale`. `y` grows downwards on screen.
import type { ObstacleKind } from '../game/types';

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
  block: { bottom: 0, height: 2.0, width: 1.7 },
  moving: { bottom: 0, height: 1.9, width: 1.8 },
  coin: { radius: 0.28 },
} as const;

export const OBSTACLE_GEOM: Record<ObstacleKind, { bottom: number; height: number; width: number }> =
  {
    low: SPRITE_GEOM.low,
    high: SPRITE_GEOM.high,
    block: SPRITE_GEOM.block,
    moving: SPRITE_GEOM.moving,
  };

export interface PlayerDrawOpts {
  sliding: boolean;
  airborne: boolean;
  t: number; // real seconds, drives idle animation
  reducedMotion?: boolean;
}

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

/** The bouncy pink brain blob with googly eyes and tiny sneakers. (x, y) is the feet anchor. */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  opts: PlayerDrawOpts,
): void {
  const g = SPRITE_GEOM.player;
  const bobAmp = opts.reducedMotion ? 0 : 0.035;
  const bob = !opts.airborne && !opts.sliding ? Math.abs(Math.sin(opts.t * 11)) * bobAmp : 0;
  const bodyH = (opts.sliding ? g.slideHeight : g.height) * scale;
  const bodyW = (opts.sliding ? g.width * 1.25 : g.width) * scale;
  const cx = x;
  const baseY = y - bob * scale;

  ctx.save();

  // Tiny sneakers, tucked up while airborne.
  const shoeY = baseY - (opts.airborne ? 0.22 : 0.02) * scale;
  const shoeR = 0.13 * scale;
  ctx.fillStyle = PALETTE.cyan;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * 0.27 * scale, shoeY, shoeR * 1.4, shoeR, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = PALETTE.yellow;
  for (const side of [-1, 1]) {
    ctx.fillRect(
      cx + side * 0.27 * scale - shoeR * 0.6,
      shoeY - shoeR * 0.2,
      shoeR * 0.5,
      shoeR * 0.4,
    );
  }

  // Brain body: a pink blob, stretched a little when airborne and squashed when sliding.
  const stretch = opts.airborne ? 1.06 : 1;
  const bodyRH = (bodyH * stretch) / 2;
  const centerY = baseY - bodyRH - 0.2 * scale;
  ctx.fillStyle = PALETTE.hotPink;
  ctx.beginPath();
  ctx.ellipse(cx, centerY, bodyW / 2, bodyRH, 0, 0, Math.PI * 2);
  ctx.fill();

  // Brain wrinkles.
  ctx.strokeStyle = '#c4136f';
  ctx.lineWidth = Math.max(1, 0.05 * scale);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - bodyW * 0.3, centerY + bodyH * 0.12);
  ctx.quadraticCurveTo(cx - bodyW * 0.1, centerY + bodyH * 0.02, cx, centerY + bodyH * 0.14);
  ctx.quadraticCurveTo(
    cx + bodyW * 0.12,
    centerY + bodyH * 0.26,
    cx + bodyW * 0.3,
    centerY + bodyH * 0.12,
  );
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - bodyW * 0.2, centerY - bodyH * 0.18);
  ctx.quadraticCurveTo(cx, centerY - bodyH * 0.3, cx + bodyW * 0.2, centerY - bodyH * 0.16);
  ctx.stroke();

  if (!opts.sliding) {
    // Googly eyes: white sclera, black pupil that jitters around the centre.
    const eyeR = 0.2 * scale;
    const eyeY = centerY - bodyH * 0.12;
    const jx = opts.reducedMotion ? 0 : Math.sin(opts.t * 7) * 0.05 * scale;
    const jy = opts.reducedMotion ? 0 : Math.cos(opts.t * 5) * 0.04 * scale;
    for (const side of [-1, 1]) {
      const ex = cx + side * bodyW * 0.22;
      ctx.fillStyle = PALETTE.white;
      ctx.beginPath();
      ctx.arc(ex, eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = Math.max(1, 0.04 * scale);
      ctx.stroke();
      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath();
      ctx.arc(ex + jx, eyeY + jy, eyeR * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Squinting eyes while sliding.
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = Math.max(1, 0.05 * scale);
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.32, centerY);
    ctx.lineTo(cx - bodyW * 0.12, centerY + 0.03 * scale);
    ctx.moveTo(cx + bodyW * 0.32, centerY);
    ctx.lineTo(cx + bodyW * 0.12, centerY + 0.03 * scale);
    ctx.stroke();
  }

  ctx.restore();
}

/** Low barrier with hazard stripes and a glowing phone screen on top. (x, y) is the base centre. */
function drawFence(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, t: number): void {
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

/** Tall purple block with a cringing face. (x, y) is the base centre. */
function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  k: number,
  geom: { height: number; width: number },
): void {
  const w = geom.width * k;
  const h = geom.height * k;
  const left = x - w / 2;
  const top = y - h;

  ctx.fillStyle = PALETTE.brickPurple;
  ctx.fillRect(left, top, w, h);
  // Brick courses.
  ctx.strokeStyle = PALETTE.brickShade;
  ctx.lineWidth = Math.max(1, 0.05 * k);
  for (let r = 1; r < 5; r++) {
    const ry = top + (h * r) / 5;
    ctx.beginPath();
    ctx.moveTo(left, ry);
    ctx.lineTo(left + w, ry);
    ctx.stroke();
  }
  // Neon outline.
  ctx.strokeStyle = PALETTE.acidGreen;
  ctx.lineWidth = Math.max(2, 0.08 * k);
  ctx.strokeRect(left, top, w, h);

  // Cringe face: squinting eyes and a wobbly mouth.
  const fy = top + h * 0.38;
  ctx.strokeStyle = PALETTE.white;
  ctx.lineWidth = Math.max(2, 0.07 * k);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.3, fy - h * 0.04);
  ctx.lineTo(x - w * 0.1, fy + h * 0.02);
  ctx.moveTo(x + w * 0.3, fy - h * 0.04);
  ctx.lineTo(x + w * 0.1, fy + h * 0.02);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - w * 0.28, fy + h * 0.2);
  ctx.quadraticCurveTo(x - w * 0.14, fy + h * 0.12, x, fy + h * 0.2);
  ctx.quadraticCurveTo(x + w * 0.14, fy + h * 0.28, x + w * 0.28, fy + h * 0.2);
  ctx.stroke();
}

/** Block on wheels with headlights. */
function drawCart(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, t: number): void {
  const g = SPRITE_GEOM.moving;
  const w = g.width * k;
  const h = g.height * k;
  const left = x - w / 2;
  const wheelR = h * 0.12;
  const bodyBottom = y - h * 0.22;

  drawBlock(ctx, x, bodyBottom, k, { height: g.height - 0.22, width: g.width });

  // Headlights: two bright discs with a pale halo (no shadowBlur).
  for (const side of [-1, 1]) {
    const hx = x + side * w * 0.3;
    const hy = bodyBottom - h * 0.62;
    ctx.fillStyle = 'rgba(255, 232, 61, 0.35)';
    ctx.beginPath();
    ctx.arc(hx, hy, wheelR * 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.yellow;
    ctx.beginPath();
    ctx.arc(hx, hy, wheelR * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Wheels with spinning spokes.
  for (const side of [-1, 1]) {
    const wx = left + w * (side < 0 ? 0.22 : 0.78);
    const wy = y - wheelR;
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(wx, wy, wheelR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.cyan;
    ctx.lineWidth = Math.max(1, 0.04 * k);
    const a = t * 10;
    ctx.beginPath();
    ctx.moveTo(wx + Math.cos(a) * wheelR * 0.8, wy + Math.sin(a) * wheelR * 0.8);
    ctx.lineTo(wx - Math.cos(a) * wheelR * 0.8, wy - Math.sin(a) * wheelR * 0.8);
    ctx.stroke();
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
      drawBlock(ctx, x, y, scale, SPRITE_GEOM.block);
      break;
    case 'moving':
      drawCart(ctx, x, y, scale, t);
      break;
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
