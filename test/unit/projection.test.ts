import { describe, expect, it } from 'vitest';
import {
  CAMERA,
  perspectiveScale,
  pixelsPerUnit,
  project,
  type Viewport,
} from '../../webview/render/projection';

const VP: Viewport = { width: 1280, height: 720 };

describe('project', () => {
  it('maps the centre lane to the horizontal centre', () => {
    expect(project(0, 0, 0, VP).x).toBeCloseTo(VP.width / 2);
    expect(project(0, 0, 50, VP).x).toBeCloseTo(VP.width / 2);
  });

  it('places left and right lanes on opposite sides of the centre', () => {
    const left = project(-1, 0, 0, VP).x;
    const centre = project(0, 0, 0, VP).x;
    const right = project(1, 0, 0, VP).x;
    expect(left).toBeLessThan(centre);
    expect(centre).toBeLessThan(right);
  });

  it('has scale 1 at z = 0 and shrinks monotonically with distance', () => {
    expect(project(0, 0, 0, VP).scale).toBeCloseTo(1);
    let prev = Infinity;
    for (let z = -5; z <= 120; z += 5) {
      const s = project(0, 0, z, VP).scale;
      expect(s).toBeLessThan(prev);
      prev = s;
    }
  });

  it('moves far objects closer to the horizon', () => {
    const horizon = VP.height * CAMERA.HORIZON_RATIO;
    const near = project(0, 0, 0, VP).y;
    const far = project(0, 0, 60, VP).y;
    expect(far).toBeLessThan(near);
    expect(far).toBeGreaterThan(horizon);
  });

  it('puts the ground at z = 0 between 75% and 95% of the height', () => {
    const y = project(0, 0, 0, VP).y;
    expect(y).toBeGreaterThan(VP.height * 0.75);
    expect(y).toBeLessThan(VP.height * 0.95);
  });

  it('raises objects as their height increases', () => {
    const ground = project(0, 0, 0, VP).y;
    const jumping = project(0, 1.6, 0, VP).y;
    expect(jumping).toBeLessThan(ground);
  });

  it('scales proportionally with the viewport', () => {
    const big: Viewport = { width: VP.width * 2, height: VP.height * 2 };
    const a = project(1, 0.8, 10, VP);
    const b = project(1, 0.8, 10, big);
    expect(b.x).toBeCloseTo(a.x * 2);
    expect(b.y).toBeCloseTo(a.y * 2);
    expect(b.scale).toBeCloseTo(a.scale);
  });

  it('keeps all three lanes on screen in a narrow portrait panel', () => {
    // Narrow panels shrink the scale (uniform, so sprites never overlap lanes) instead of
    // letting the outer lanes fall off the edge. The ground line therefore sits higher here.
    const narrow: Viewport = { width: 400, height: 800 };
    const left = project(-1, 0, 0, narrow);
    const right = project(1, 0, 0, narrow);
    expect(left.x).toBeGreaterThan(0);
    expect(right.x).toBeLessThan(narrow.width);
    expect(left.y).toBeGreaterThan(narrow.height * CAMERA.HORIZON_RATIO);
    expect(left.y).toBeLessThan(narrow.height);
  });

  it('clamps the perspective scale near the camera instead of diverging', () => {
    const atClamp = perspectiveScale(-CAMERA.FOCAL);
    expect(Number.isFinite(atClamp)).toBe(true);
    expect(atClamp).toBeCloseTo(CAMERA.FOCAL / 0.01);
    expect(perspectiveScale(-CAMERA.FOCAL - 3)).toBeCloseTo(CAMERA.FOCAL / 0.01);
  });
});

describe('pixelsPerUnit', () => {
  it('is proportional to viewport size', () => {
    expect(pixelsPerUnit({ width: 2000, height: 1000 })).toBeCloseTo(
      2 * pixelsPerUnit({ width: 1000, height: 500 }),
    );
  });
});
