/** Minimal sound-effect API used by the game. All methods are safe no-ops when audio is off. */
export interface Sfx {
  coin(): void;
  jump(): void;
  slide(): void;
  crash(): void;
  setEnabled(on: boolean): void;
  readonly enabled: boolean;
}

/** The subset of the Web Audio API used here, so tests can inject a fake. */
export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
  exponentialRampToValueAtTime(value: number, time: number): void;
}

export interface OscillatorLike {
  type: string;
  readonly frequency: AudioParamLike;
  connect(node: unknown): void;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface GainNodeLike {
  readonly gain: AudioParamLike;
  connect(node: unknown): void;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state?: string;
  createOscillator(): OscillatorLike;
  createGain(): GainNodeLike;
  resume?(): Promise<void>;
}

type ContextFactory = () => AudioContextLike | null;

interface Blip {
  type: OscillatorType;
  fromHz: number;
  toHz: number;
  duration: number;
  volume: number;
}

const COIN: Blip = { type: 'square', fromHz: 880, toHz: 1320, duration: 0.08, volume: 0.12 };
const JUMP: Blip = { type: 'triangle', fromHz: 300, toHz: 700, duration: 0.15, volume: 0.18 };
const SLIDE: Blip = { type: 'square', fromHz: 220, toHz: 90, duration: 0.2, volume: 0.1 };
const CRASH: Blip = { type: 'sawtooth', fromHz: 400, toHz: 40, duration: 0.5, volume: 0.2 };

const defaultFactory: ContextFactory = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  const Ctor = (window as unknown as { AudioContext?: new () => AudioContextLike }).AudioContext;
  return Ctor ? new Ctor() : null;
};

/**
 * Creates the sound-effect player. The AudioContext is created lazily on the first sound,
 * because browsers only allow audio after a user gesture.
 */
export function createAudio(enabled: boolean, ctxFactory: ContextFactory = defaultFactory): Sfx {
  let on = enabled;
  let ctx: AudioContextLike | null = null;
  let unavailable = false;

  function context(): AudioContextLike | null {
    if (ctx) {
      return ctx;
    }
    if (unavailable) {
      return null;
    }
    try {
      ctx = ctxFactory();
    } catch {
      ctx = null;
    }
    if (!ctx) {
      unavailable = true;
    }
    return ctx;
  }

  function play(blip: Blip): void {
    if (!on) {
      return;
    }
    try {
      const audio = context();
      if (!audio) {
        return;
      }
      if (audio.state === 'suspended' && audio.resume) {
        void audio.resume().catch(() => undefined);
      }
      const t = audio.currentTime;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = blip.type;
      osc.frequency.setValueAtTime(blip.fromHz, t);
      osc.frequency.exponentialRampToValueAtTime(blip.toHz, t + blip.duration);
      gain.gain.setValueAtTime(blip.volume, t);
      gain.gain.linearRampToValueAtTime(0.0001, t + blip.duration);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(t);
      osc.stop(t + blip.duration);
    } catch {
      // Audio is non-essential; never let it break the game.
    }
  }

  return {
    coin: () => play(COIN),
    jump: () => play(JUMP),
    slide: () => play(SLIDE),
    crash: () => play(CRASH),
    setEnabled(value: boolean): void {
      on = value;
    },
    get enabled(): boolean {
      return on;
    },
  };
}
