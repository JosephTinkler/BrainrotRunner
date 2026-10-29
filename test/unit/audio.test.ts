import { describe, it, expect, vi } from 'vitest';
import { createAudio, type AudioContextLike, type OscillatorLike } from '../../webview/audio';

function param() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

function fakeContext() {
  const oscillators: Array<
    OscillatorLike & { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }
  > = [];
  const ctx = {
    currentTime: 1,
    destination: {},
    createOscillator: vi.fn(() => {
      const osc = {
        type: 'sine',
        frequency: param(),
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => ({ gain: param(), connect: vi.fn() })),
  };
  return { ctx: ctx as unknown as AudioContextLike, raw: ctx, oscillators };
}

describe('createAudio', () => {
  it('never calls the context factory when disabled', () => {
    const factory = vi.fn(() => fakeContext().ctx);
    const sfx = createAudio(false, factory);
    sfx.coin();
    sfx.jump();
    sfx.slide();
    sfx.crash();
    expect(factory).not.toHaveBeenCalled();
    expect(sfx.enabled).toBe(false);
  });

  it('creates an oscillator and starts it on coin() when enabled', () => {
    const fake = fakeContext();
    const factory = vi.fn(() => fake.ctx);
    const sfx = createAudio(true, factory);
    expect(factory).not.toHaveBeenCalled();
    sfx.coin();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(fake.raw.createOscillator).toHaveBeenCalledTimes(1);
    expect(fake.oscillators[0].start).toHaveBeenCalledTimes(1);
    expect(fake.oscillators[0].stop).toHaveBeenCalledTimes(1);
    expect(sfx.enabled).toBe(true);
  });

  it('reuses one context across sounds', () => {
    const fake = fakeContext();
    const factory = vi.fn(() => fake.ctx);
    const sfx = createAudio(true, factory);
    sfx.jump();
    sfx.slide();
    sfx.crash();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(fake.oscillators.length).toBe(3);
  });

  it('is a no-op and never throws when the factory returns null', () => {
    const factory = vi.fn(() => null);
    const sfx = createAudio(true, factory);
    expect(() => {
      sfx.coin();
      sfx.crash();
    }).not.toThrow();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('never throws when the factory throws', () => {
    const sfx = createAudio(true, () => {
      throw new Error('no audio');
    });
    expect(() => sfx.jump()).not.toThrow();
  });

  it('never throws when the context fails mid-sound', () => {
    const sfx = createAudio(true, () => ({
      currentTime: 0,
      destination: {},
      createOscillator: () => {
        throw new Error('boom');
      },
      createGain: () => ({ gain: param(), connect: vi.fn() }),
    }));
    expect(() => sfx.slide()).not.toThrow();
  });

  it('setEnabled toggles playback and the enabled flag', () => {
    const fake = fakeContext();
    const factory = vi.fn(() => fake.ctx);
    const sfx = createAudio(false, factory);

    sfx.setEnabled(true);
    expect(sfx.enabled).toBe(true);
    sfx.coin();
    expect(fake.oscillators.length).toBe(1);

    sfx.setEnabled(false);
    expect(sfx.enabled).toBe(false);
    sfx.coin();
    expect(fake.oscillators.length).toBe(1);
  });
});
