import { describe, expect, it } from 'vitest';
import { STRIDE_K, drawPlayer, runPose } from '../../webview/render/player';

/** Permissive stand-in for CanvasRenderingContext2D (see renderer.test.ts). */
function makeDummy(store: Map<PropertyKey, unknown> = new Map()): CanvasRenderingContext2D {
  const target = (): unknown => undefined;
  const proxy = new Proxy(target, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      if (store.has(prop)) return store.get(prop);
      return makeDummy();
    },
    set(_t, prop, value) {
      store.set(prop, value);
      return true;
    },
    apply() {
      return makeDummy();
    },
  });
  return proxy as unknown as CanvasRenderingContext2D;
}

const RUN = { airborne: false, sliding: false };
const TWO_PI = Math.PI * 2;

function numbers(p: ReturnType<typeof runPose>): number[] {
  return [
    p.near.thigh,
    p.near.shin,
    p.near.arm,
    p.far.thigh,
    p.far.shin,
    p.far.arm,
    p.bob,
    p.squash,
    p.lean,
  ];
}

describe('runPose', () => {
  it('is periodic in phase with period 2π', () => {
    for (let i = 0; i < 40; i++) {
      const phase = i * 0.37 - 5;
      const a = numbers(runPose(phase, RUN));
      const b = numbers(runPose(phase + TWO_PI, RUN));
      a.forEach((v, j) => expect(b[j]).toBeCloseTo(v, 9));
    }
  });

  it('bobs twice per cycle and swaps legs every half cycle', () => {
    const a = runPose(0.7, RUN);
    const b = runPose(0.7 + Math.PI, RUN);
    expect(b.bob).toBeCloseTo(a.bob, 9);
    expect(b.near.thigh).toBeCloseTo(a.far.thigh, 9);
    expect(b.far.arm).toBeCloseTo(a.near.arm, 9);
  });

  it('stays bounded for any phase and pose', () => {
    for (const opts of [
      RUN,
      { airborne: true, sliding: false },
      { airborne: false, sliding: true },
    ]) {
      for (let i = 0; i < 200; i++) {
        const p = runPose(i * 1.3 - 100, opts);
        for (const v of numbers(p)) expect(Math.abs(v)).toBeLessThanOrEqual(3);
        expect(p.bob).toBeGreaterThanOrEqual(0);
        expect(p.bob).toBeLessThan(0.1);
        expect(p.squash).toBeLessThan(0.15);
      }
    }
  });

  it('is neutral and phase-independent under reduced motion', () => {
    const base = runPose(0, { ...RUN, reducedMotion: true });
    for (const phase of [0.4, 1.9, 4.2, 100]) {
      expect(runPose(phase, { ...RUN, reducedMotion: true })).toEqual(base);
    }
    expect(base.bob).toBe(0);
    expect(base.squash).toBe(0);
    expect(base.near).toEqual(base.far);
  });

  it('tucks legs and raises arms when airborne; slides with legs forward', () => {
    const run = runPose(1, RUN);
    const air = runPose(1, { airborne: true, sliding: false });
    const slide = runPose(1, { airborne: false, sliding: true });
    expect(air.near.shin).toBeGreaterThan(run.near.shin);
    expect(air.near.arm).toBeGreaterThan(run.near.arm);
    expect(slide.near.thigh).toBeGreaterThan(run.near.thigh);
    expect(slide.squash).toBeGreaterThan(0);
  });

  it('completes one cycle every 3.5 world units', () => {
    expect(STRIDE_K * 3.5).toBeCloseTo(TWO_PI, 9);
  });
});

describe('drawPlayer', () => {
  const poses = {
    run: { sliding: false, airborne: false },
    jump: { sliding: false, airborne: true },
    slide: { sliding: true, airborne: false },
    'reduced motion': { sliding: false, airborne: false, reducedMotion: true },
  };
  for (const [name, pose] of Object.entries(poses)) {
    it(`draws the ${name} pose without throwing`, () => {
      const ctx = makeDummy();
      for (const phase of [0, 1.3, 4.9]) {
        expect(() => drawPlayer(ctx, 400, 500, 60, { ...pose, t: 1.2, phase })).not.toThrow();
      }
    });
  }

  it('tolerates tiny scales', () => {
    expect(() =>
      drawPlayer(makeDummy(), 0, 0, 0.5, { sliding: false, airborne: false, t: 0, phase: 0 }),
    ).not.toThrow();
  });
});
