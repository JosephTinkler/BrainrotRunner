// Pseudo-3D projection: world (laneX, y, z) -> screen (x, y, scale).
// Pure and DOM-free so it can be unit tested in node.

export interface Viewport {
  width: number; // CSS pixels
  height: number; // CSS pixels
}

export interface Projected {
  x: number;
  y: number;
  /** Dimensionless perspective factor: 1 at z = 0, smaller further away. */
  scale: number;
}

export const CAMERA = {
  FOCAL: 9,
  HORIZON_RATIO: 0.32, // horizon y as a fraction of viewport height
  LANE_WIDTH: 2.2, // world units between lane centres (laneX is -1, 0, 1)
  CAMERA_HEIGHT: 3.2, // world units above the ground
  PLAYER_SCREEN_Z: 0,
};

/**
 * Pixels per world unit at scale 1. Fits both the height (ground sits near 85% of the height)
 * and the width (three lanes fit inside narrow panels), so it scales with the panel.
 */
export function pixelsPerUnit(vp: Viewport): number {
  return Math.min(vp.height / 6, vp.width / 7);
}

/** Perspective scale at depth z. Clamped so objects very close to the camera do not blow up. */
export function perspectiveScale(z: number): number {
  const denom = Math.max(z + CAMERA.FOCAL, 0.01);
  return CAMERA.FOCAL / denom;
}

export function project(laneX: number, y: number, z: number, vp: Viewport): Projected {
  const scale = perspectiveScale(z);
  const unit = pixelsPerUnit(vp);
  const horizonY = vp.height * CAMERA.HORIZON_RATIO;
  return {
    x: vp.width / 2 + laneX * CAMERA.LANE_WIDTH * scale * unit,
    y: horizonY + (CAMERA.CAMERA_HEIGHT - y) * scale * unit,
    scale,
  };
}
