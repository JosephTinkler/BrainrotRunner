// The player character: a shaded pink brain blob with googly eyes, swinging arms and legs with
// sneakers. Same conventions as sprites.ts: (x, y) is the feet anchor and `scale` is pixels per
// world unit at the player's depth. `y` grows downwards on screen.
import { PALETTE, SPRITE_GEOM } from './sprites';

/**
 * Stride phase advance per world unit of ground scrolled. One full run cycle (two steps) covers
 * 3.5 world units; slower than that would alias against the frame rate at top speed.
 */
export const STRIDE_K = (Math.PI * 2) / 3.5;

export interface PlayerDrawOpts {
  sliding: boolean;
  airborne: boolean;
  t: number; // real seconds, drives idle animation
  /** Stride phase in radians (`scroll * STRIDE_K`); the run pose is periodic with period 2π. */
  phase: number;
  reducedMotion?: boolean;
}

export interface RunPoseOpts {
  airborne: boolean;
  sliding: boolean;
  reducedMotion?: boolean;
}

/**
 * Limb angles in radians. Legs: `thigh` is the swing away from straight down (positive = outward
 * from the body centre), `shin` is the extra knee bend that folds the foot back up and inward.
 * Arms: angle from hanging straight down, positive = outward/up (π = straight up).
 */
export interface RunPose {
  near: { thigh: number; shin: number; arm: number };
  far: { thigh: number; shin: number; arm: number };
  /** Body lift in world units. */
  bob: number;
  /** Vertical squash fraction (0 = none). */
  squash: number;
  /** Body tilt in radians. */
  lean: number;
}

const NEUTRAL_ARM = 0.35;
const NEUTRAL_THIGH = 0.12;

/**
 * Pure pose function. The run cycle is periodic in `phase` with period 2π: the near and far legs
 * are half a cycle apart, the bob and foot-strike squash happen twice per cycle, and each arm
 * swings against its own-side leg. Under `reducedMotion` the cyclic run pose is neutral and does
 * not depend on `phase`; the airborne (tucked) and sliding poses are still shown, since they
 * convey game state rather than animation.
 */
export function runPose(phase: number, opts: RunPoseOpts): RunPose {
  if (opts.sliding) {
    // Legs shoved forward, arms trailing back, body squashed.
    const side = { thigh: 1.25, shin: 0.15, arm: 0.25 };
    return { near: { ...side }, far: { ...side }, bob: 0, squash: 0.08, lean: 0 };
  }
  if (opts.airborne) {
    // Knees tucked up, arms thrown overhead.
    return {
      near: { thigh: 0.55, shin: 1.5, arm: 2.6 },
      far: { thigh: 0.45, shin: 1.4, arm: 2.4 },
      bob: 0,
      squash: -0.04, // slight stretch
      lean: 0,
    };
  }
  if (opts.reducedMotion) {
    const limb = { thigh: NEUTRAL_THIGH, shin: 0, arm: NEUTRAL_ARM };
    return { near: { ...limb }, far: { ...limb }, bob: 0, squash: 0, lean: 0 };
  }
  const limb = (p: number): RunPose['near'] => ({
    thigh: NEUTRAL_THIGH + 0.45 * Math.sin(p),
    // Knee folds while the leg swings back up to the front (cos > 0 half of the cycle).
    shin: 1.0 * Math.max(0, Math.cos(p)),
    // Arm swings against the same-side leg.
    arm: NEUTRAL_ARM + 0.55 * Math.sin(p + Math.PI),
  });
  return {
    near: limb(phase),
    far: limb(phase + Math.PI),
    bob: 0.05 * Math.abs(Math.sin(phase)),
    // Peaks at the two foot-strikes per cycle (where the bob is lowest).
    squash: 0.06 * Math.pow(0.5 + 0.5 * Math.cos(2 * phase), 2),
    lean: 0.05 + 0.025 * Math.sin(phase),
  };
}

const SHADE = {
  limb: '#c4136f',
  limbFar: '#7d0a47',
  cyan: PALETTE.cyan,
  cyanFar: '#139aa6',
  yellow: PALETTE.yellow,
  yellowFar: '#a89a22',
} as const;

const THIGH_LEN = 0.13;
const SHIN_LEN = 0.13;
const ARM_LEN = 0.3;
const HIP_X = 0.27;

/** Two-segment leg from the hip with a sneaker on the foot. `side` is -1 (left) or 1 (right). */
function drawLeg(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  side: number,
  limb: RunPose['near'],
  scale: number,
  far: boolean,
): void {
  const kneeX = hipX + side * Math.sin(limb.thigh) * THIGH_LEN * scale;
  const kneeY = hipY + Math.cos(limb.thigh) * THIGH_LEN * scale;
  const shinAngle = limb.thigh - limb.shin;
  const footX = kneeX + side * Math.sin(shinAngle) * SHIN_LEN * scale;
  const footY = kneeY + Math.cos(shinAngle) * SHIN_LEN * scale;

  ctx.strokeStyle = far ? SHADE.limbFar : SHADE.limb;
  ctx.lineWidth = Math.max(1, 0.1 * scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(kneeX, kneeY);
  ctx.lineTo(footX, footY);
  ctx.stroke();

  // Sneaker: cyan with a yellow stripe, tilted with the shin.
  const shoeR = 0.13 * scale;
  ctx.fillStyle = far ? SHADE.cyanFar : SHADE.cyan;
  ctx.beginPath();
  ctx.ellipse(footX, footY, shoeR * 1.4, shoeR, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = far ? SHADE.yellowFar : SHADE.yellow;
  ctx.fillRect(footX - shoeR * 0.6, footY - shoeR * 0.2, shoeR * 0.5, shoeR * 0.4);
}

/** Single-segment arm with a round hand. Angle is measured from hanging straight down. */
function drawArm(
  ctx: CanvasRenderingContext2D,
  shoulderX: number,
  shoulderY: number,
  side: number,
  angle: number,
  scale: number,
  far: boolean,
): void {
  const handX = shoulderX + side * Math.sin(angle) * ARM_LEN * scale;
  const handY = shoulderY + Math.cos(angle) * ARM_LEN * scale;
  ctx.strokeStyle = far ? SHADE.limbFar : SHADE.limb;
  ctx.lineWidth = Math.max(1, 0.08 * scale);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(handX, handY);
  ctx.stroke();
  ctx.fillStyle = far ? SHADE.limbFar : '#ff6fb5';
  ctx.beginPath();
  ctx.arc(handX, handY, 0.07 * scale, 0, Math.PI * 2);
  ctx.fill();
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
  const pose = runPose(opts.phase, opts);
  const bodyH = (opts.sliding ? g.slideHeight : g.height) * scale;
  const bodyW = (opts.sliding ? g.width * 1.25 : g.width) * scale;
  const cx = x;
  const baseY = y - pose.bob * scale;
  // Squash keeps the body bottom fixed; widen slightly to roughly preserve volume.
  const bodyRH = (bodyH * (1 - pose.squash)) / 2;
  const bodyRW = (bodyW * (1 + pose.squash * 0.6)) / 2;
  const centerY = baseY - bodyRH - 0.2 * scale;
  const hipY = baseY - 0.24 * scale;
  const shoulderY = centerY + bodyRH * 0.15;

  ctx.save();
  // Lean around the feet.
  ctx.translate(cx, y);
  ctx.rotate(pose.lean);
  ctx.translate(-cx, -y);

  // Far-side limbs first, in a darker tint, behind the body.
  drawLeg(ctx, cx - HIP_X * scale, hipY, -1, pose.far, scale, true);
  drawArm(ctx, cx - bodyRW * 0.92, shoulderY, -1, pose.far.arm, scale, true);

  // Brain body: radial gradient lit from the upper left, with a darker rim.
  const body = ctx.createRadialGradient(
    cx - bodyRW * 0.35,
    centerY - bodyRH * 0.4,
    Math.max(1, bodyRW * 0.1),
    cx,
    centerY,
    Math.max(2, Math.max(bodyRW, bodyRH) * 1.05),
  );
  body.addColorStop(0, '#ffa6d4');
  body.addColorStop(0.45, PALETTE.hotPink);
  body.addColorStop(1, '#a30e5a');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(cx, centerY, bodyRW, bodyRH, 0, 0, Math.PI * 2);
  ctx.fill();

  // Everything else on the body is clipped to the ellipse.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, centerY, bodyRW, bodyRH, 0, 0, Math.PI * 2);
  ctx.clip();

  // Darker underside.
  const under = ctx.createLinearGradient(0, centerY, 0, centerY + bodyRH);
  under.addColorStop(0, 'rgba(60, 0, 40, 0)');
  under.addColorStop(1, 'rgba(60, 0, 40, 0.4)');
  ctx.fillStyle = under;
  ctx.fillRect(cx - bodyRW, centerY, bodyRW * 2, bodyRH);

  // Centre fissure and curved wrinkles that follow the ellipse.
  ctx.strokeStyle = '#a30e5a';
  ctx.lineWidth = Math.max(1, 0.05 * scale);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, centerY - bodyRH);
  ctx.quadraticCurveTo(
    cx + bodyRW * 0.1,
    centerY - bodyRH * 0.4,
    cx - bodyRW * 0.04,
    centerY + bodyRH * 0.1,
  );
  ctx.quadraticCurveTo(cx - bodyRW * 0.08, centerY + bodyRH * 0.4, cx, centerY + bodyRH * 0.62);
  ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * bodyRW * 0.12, centerY + bodyRH * 0.3);
    ctx.quadraticCurveTo(
      cx + side * bodyRW * 0.45,
      centerY + bodyRH * 0.12,
      cx + side * bodyRW * 0.72,
      centerY + bodyRH * 0.38,
    );
    ctx.moveTo(cx + side * bodyRW * 0.22, centerY - bodyRH * 0.5);
    ctx.quadraticCurveTo(
      cx + side * bodyRW * 0.5,
      centerY - bodyRH * 0.62,
      cx + side * bodyRW * 0.72,
      centerY - bodyRH * 0.3,
    );
    ctx.stroke();
  }
  ctx.restore();

  // Specular highlight blob, upper left.
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = PALETTE.white;
  ctx.beginPath();
  ctx.ellipse(
    cx - bodyRW * 0.5,
    centerY - bodyRH * 0.62,
    bodyRW * 0.16,
    bodyRH * 0.09,
    -0.6,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();

  if (!opts.sliding) {
    // Googly eyes: white sclera, black pupil that jitters around the centre, with a gloss dot.
    const eyeR = 0.2 * scale;
    const eyeY = centerY - bodyH * 0.12;
    const jx = opts.reducedMotion ? 0 : Math.sin(opts.t * 7) * 0.05 * scale;
    const jy = opts.reducedMotion ? 0 : Math.cos(opts.t * 5) * 0.04 * scale;
    for (const side of [-1, 1]) {
      const ex = cx + side * bodyRW * 0.44;
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
      ctx.fillStyle = PALETTE.white;
      ctx.beginPath();
      ctx.arc(ex + jx - eyeR * 0.14, eyeY + jy - eyeR * 0.16, eyeR * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Squinting eyes while sliding.
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = Math.max(1, 0.05 * scale);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - bodyRW * 0.64, centerY);
    ctx.lineTo(cx - bodyRW * 0.24, centerY + 0.03 * scale);
    ctx.moveTo(cx + bodyRW * 0.64, centerY);
    ctx.lineTo(cx + bodyRW * 0.24, centerY + 0.03 * scale);
    ctx.stroke();
  }

  // Near-side limbs in front of the body.
  drawLeg(ctx, cx + HIP_X * scale, hipY, 1, pose.near, scale, false);
  drawArm(ctx, cx + bodyRW * 0.92, shoulderY, 1, pose.near.arm, scale, false);

  ctx.restore();
}
