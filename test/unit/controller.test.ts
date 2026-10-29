import { describe, expect, it, vi } from 'vitest';
import { GameController, type ControllerDeps } from '../../webview/controller';
import { CONFIG } from '../../webview/game/config';
import { createInitialState } from '../../webview/game/state';
import type { Ui } from '../../webview/ui';
import type { Sfx } from '../../webview/audio';
import type { HighScoreEntry, HostToWebview, Settings, WebviewToHost } from '../../src/messages';

type Screen = Ui['screen'];

function entry(score: number): HighScoreEntry {
  return { score, coins: 1, distance: 100, durationMs: 1000, date: '2026-01-01T00:00:00.000Z' };
}

/** Fake Ui that tracks which screen is showing, the way the real Ui does. */
function fakeUi() {
  let screen: Screen = 'none';
  return {
    get screen(): Screen {
      return screen;
    },
    showTitle: vi.fn(() => {
      screen = 'title';
    }),
    showHighScores: vi.fn(() => {
      screen = 'highScores';
    }),
    showPause: vi.fn(() => {
      screen = 'pause';
    }),
    showGameOver: vi.fn(() => {
      screen = 'gameOver';
    }),
    updateHighScores: vi.fn(),
    hide: vi.fn(() => {
      screen = 'none';
    }),
  };
}

function fakeSfx() {
  return {
    coin: vi.fn(),
    jump: vi.fn(),
    slide: vi.fn(),
    crash: vi.fn(),
    setEnabled: vi.fn(),
    enabled: true,
  } satisfies Sfx & Record<string, unknown>;
}

const SETTINGS: Settings = { sound: true, reducedMotion: false };

function setup(overrides: Partial<ControllerDeps> = {}) {
  const ui = fakeUi();
  const sfx = fakeSfx();
  const posted: WebviewToHost[] = [];
  let seed = 1000;
  let clock = 0;
  const controller = new GameController({
    ui,
    sfx,
    post: (msg) => posted.push(msg),
    now: () => clock,
    seed: () => seed,
    ...overrides,
  });
  return {
    controller,
    ui,
    sfx,
    posted,
    setSeed(value: number) {
      seed = value;
    },
    setClock(value: number) {
      clock = value;
    },
  };
}

function init(
  controller: GameController,
  extra: Partial<Extract<HostToWebview, { type: 'init' }>> = {},
): void {
  controller.handleHostMessage({
    type: 'init',
    highScores: [],
    settings: SETTINGS,
    ...extra,
  });
}

/** Ticks in 0.1 s frames until the phase changes or the limit is reached. */
function tickUntilPhase(
  controller: GameController,
  phase: GameController['state']['phase'],
  maxSeconds = 120,
): void {
  for (let t = 0; t < maxSeconds * 10 && controller.state.phase !== phase; t++) {
    controller.tick(0.1);
  }
}

describe('GameController host messages', () => {
  it('init shows the title with the best score from the list', () => {
    const { controller, ui } = setup();
    init(controller, { highScores: [entry(120), entry(300), entry(50)] });
    expect(controller.best).toBe(300);
    expect(controller.highScores).toHaveLength(3);
    expect(ui.showTitle).toHaveBeenLastCalledWith(300);
  });

  it('init with view highScores shows the high-score table', () => {
    const { controller, ui } = setup();
    init(controller, { highScores: [entry(10)], view: 'highScores' });
    expect(ui.showHighScores).toHaveBeenCalledWith([entry(10)]);
    expect(ui.showTitle).not.toHaveBeenCalled();
  });

  it('init applies the sound setting and reduced motion', () => {
    const setReducedMotion = vi.fn();
    const { controller, sfx } = setup({ setReducedMotion });
    init(controller, { settings: { sound: false, reducedMotion: true } });
    expect(sfx.setEnabled).toHaveBeenCalledWith(false);
    expect(setReducedMotion).toHaveBeenCalledWith(true);
  });

  it('a highScores message updates the list and best, and forwards newRank', () => {
    const { controller, ui } = setup();
    init(controller, { highScores: [] });
    controller.handleHostMessage({ type: 'highScores', list: [entry(77)], newRank: 1 });
    expect(controller.best).toBe(77);
    expect(ui.updateHighScores).toHaveBeenCalledWith([entry(77)], 1);
  });

  it('start() shows the title before init arrives, with best 0', () => {
    const { controller, ui } = setup();
    controller.start();
    expect(ui.showTitle).toHaveBeenCalledWith(0);
  });
});

describe('GameController commands', () => {
  it('confirm on the title screen starts a run', () => {
    const { controller, ui, setSeed } = setup();
    setSeed(42);
    init(controller);
    controller.onCommand('confirm');
    expect(controller.state.phase).toBe('running');
    expect(controller.state.seed).toBe(42);
    expect(ui.hide).toHaveBeenCalled();
  });

  it('confirm while running is ignored and does not reset the run', () => {
    const { controller, setSeed } = setup();
    setSeed(7);
    init(controller);
    controller.onCommand('confirm');
    for (let i = 0; i < 30; i++) controller.tick(CONFIG.FIXED_DT);
    const before = controller.state;
    setSeed(99);
    controller.onCommand('confirm');
    expect(controller.state).toBe(before);
    expect(controller.state.seed).toBe(7);
  });

  it('pause toggles the run and shows or hides the pause UI', () => {
    const { controller, ui } = setup();
    init(controller);
    controller.onCommand('confirm');

    controller.onCommand('pause');
    expect(controller.state.phase).toBe('paused');
    expect(ui.showPause).toHaveBeenCalledTimes(1);

    controller.onCommand('pause');
    expect(controller.state.phase).toBe('running');
    expect(ui.hide).toHaveBeenCalledTimes(2);
  });

  it('pause is ignored on the title screen', () => {
    const { controller, ui } = setup();
    init(controller);
    controller.onCommand('pause');
    expect(controller.state.phase).toBe('title');
    expect(ui.showPause).not.toHaveBeenCalled();
  });

  it('restart from paused starts a new run with a new seed', () => {
    const { controller, setSeed } = setup();
    setSeed(5);
    init(controller);
    controller.onCommand('confirm');
    controller.onCommand('pause');
    setSeed(6);
    controller.onCommand('restart');
    expect(controller.state.phase).toBe('running');
    expect(controller.state.seed).toBe(6);
  });

  it('confirm on the high-score screen returns to the title', () => {
    const { controller, ui } = setup();
    init(controller, { view: 'highScores' });
    controller.onCommand('confirm');
    expect(ui.showTitle).toHaveBeenLastCalledWith(0);
  });
});

describe('GameController actions and sound', () => {
  it('actions are ignored unless running', () => {
    const { controller, sfx } = setup();
    init(controller);
    controller.onAction('jump');
    controller.tick(0.1);
    expect(sfx.jump).not.toHaveBeenCalled();
    expect(controller.state.phase).toBe('title');
  });

  it('a jump plays its sound once, when it takes effect', () => {
    const { controller, sfx } = setup();
    init(controller);
    controller.onCommand('confirm');
    controller.onAction('jump');
    controller.tick(0.1);
    expect(sfx.jump).toHaveBeenCalledTimes(1);
    expect(controller.state.player.jumpT).toBeGreaterThanOrEqual(0);
    // Jumping again mid-air is buffered, not applied, so no second sound.
    controller.onAction('jump');
    controller.tick(0.1);
    expect(sfx.jump).toHaveBeenCalledTimes(1);
  });

  it('sfx.coin is called when the coin count increases', () => {
    const { controller, sfx } = setup();
    init(controller);
    controller.onCommand('confirm');
    controller.state = {
      ...controller.state,
      coinsList: [{ id: 999999, lane: 0, z: 0, y: 0, collected: false }],
    };
    controller.tick(CONFIG.FIXED_DT);
    expect(controller.state.coins).toBe(1);
    expect(sfx.coin).toHaveBeenCalledTimes(1);
  });

  it('sound disabled in settings disables the sfx player', () => {
    const { controller, sfx } = setup();
    init(controller, { settings: { sound: false, reducedMotion: false } });
    expect(sfx.setEnabled).toHaveBeenCalledWith(false);
  });
});

describe('GameController visibility', () => {
  it('hiding the panel pauses a running game', () => {
    const { controller, ui } = setup();
    init(controller);
    controller.onCommand('confirm');
    controller.onVisibilityHidden();
    expect(controller.state.phase).toBe('paused');
    expect(ui.showPause).toHaveBeenCalled();
  });

  it('a pause message from the host pauses a running game', () => {
    const { controller, ui } = setup();
    init(controller);
    controller.onCommand('confirm');
    controller.handleHostMessage({ type: 'pause' });
    expect(controller.state.phase).toBe('paused');
    expect(ui.showPause).toHaveBeenCalled();
  });

  it('a pause message does nothing when no run is active', () => {
    const { controller, ui } = setup();
    init(controller);
    controller.handleHostMessage({ type: 'pause' });
    expect(controller.state.phase).toBe('title');
    expect(ui.showPause).not.toHaveBeenCalled();
  });

  it('hiding the panel does nothing when no run is active', () => {
    const { controller, ui } = setup();
    init(controller);
    controller.onVisibilityHidden();
    expect(controller.state.phase).toBe('title');
    expect(ui.showPause).not.toHaveBeenCalled();
  });
});

describe('GameController game over', () => {
  it('a run that dies posts exactly one gameOver and shows the game-over screen', () => {
    const { controller, ui, posted, sfx, setSeed } = setup();
    setSeed(12345);
    init(controller);
    controller.onCommand('confirm');

    tickUntilPhase(controller, 'gameover');
    expect(controller.state.phase).toBe('gameover');
    expect(sfx.crash).toHaveBeenCalledTimes(1);

    const gameOvers = posted.filter((m) => m.type === 'gameOver');
    expect(gameOvers).toHaveLength(1);
    const msg = gameOvers[0];
    if (msg.type !== 'gameOver') throw new Error('unreachable');
    expect(Number.isInteger(msg.distance)).toBe(true);
    expect(Number.isInteger(msg.durationMs)).toBe(true);
    expect(msg.distance).toBeGreaterThan(0);
    expect(msg.durationMs).toBeGreaterThan(0);

    expect(ui.showGameOver).toHaveBeenCalledTimes(1);
    expect(ui.showGameOver).toHaveBeenCalledWith(
      {
        score: msg.score,
        coins: msg.coins,
        distance: msg.distance,
        durationMs: msg.durationMs,
      },
      null,
    );

    // Further ticks after game over must not post again.
    for (let i = 0; i < 50; i++) controller.tick(0.1);
    expect(posted.filter((m) => m.type === 'gameOver')).toHaveLength(1);
    expect(ui.showGameOver).toHaveBeenCalledTimes(1);
  });

  it('a highScores message after game over updates the game-over screen with the rank', () => {
    const { controller, ui, setSeed } = setup();
    setSeed(12345);
    init(controller);
    controller.onCommand('confirm');
    tickUntilPhase(controller, 'gameover');

    const list = [entry(500), entry(100)];
    controller.handleHostMessage({ type: 'highScores', list, newRank: 1 });
    expect(ui.updateHighScores).toHaveBeenCalledWith(list, 1);
    expect(controller.best).toBe(500);
  });

  it('confirm or restart from game over starts a new run', () => {
    const { controller, setSeed, ui } = setup();
    setSeed(12345);
    init(controller);
    controller.onCommand('confirm');
    tickUntilPhase(controller, 'gameover');

    setSeed(777);
    controller.onCommand('restart');
    expect(controller.state.phase).toBe('running');
    expect(controller.state.seed).toBe(777);
    expect(ui.hide).toHaveBeenCalled();
  });

  it('ignores restart on a run that is still active', () => {
    const { controller } = setup();
    init(controller);
    controller.onCommand('confirm');
    const before = controller.state;
    controller.onCommand('restart');
    expect(controller.state).toBe(before);
  });
});

describe('GameController UI handlers', () => {
  it('maps the overlay buttons to controller actions', () => {
    const { controller, ui, posted, setSeed } = setup();
    init(controller);
    const handlers = controller.uiHandlers();

    setSeed(1);
    handlers.onStart();
    expect(controller.state.phase).toBe('running');

    handlers.onResume();
    expect(controller.state.phase).toBe('running');

    controller.onCommand('pause');
    handlers.onResume();
    expect(controller.state.phase).toBe('running');

    controller.onCommand('pause');
    setSeed(2);
    handlers.onRestart();
    expect(controller.state.seed).toBe(2);

    controller.onCommand('pause');
    handlers.onQuit();
    expect(controller.state.phase).toBe('title');
    expect(ui.showTitle).toHaveBeenLastCalledWith(0);

    handlers.onShowHighScores();
    expect(posted).toContainEqual({ type: 'requestHighScores' });
    expect(ui.showHighScores).toHaveBeenCalled();

    handlers.onBack();
    expect(ui.showTitle).toHaveBeenLastCalledWith(0);
  });

  it('quitting from the game-over screen returns to a title state', () => {
    const { controller, setSeed } = setup();
    setSeed(12345);
    init(controller);
    controller.onCommand('confirm');
    tickUntilPhase(controller, 'gameover');
    controller.uiHandlers().onQuit();
    expect(controller.state).toEqual(createInitialState(12345, 'title'));
  });
});

describe('GameController tick', () => {
  it('does not advance the simulation while paused', () => {
    const { controller } = setup();
    init(controller);
    controller.onCommand('confirm');
    controller.onCommand('pause');
    const before = controller.state;
    controller.tick(1);
    expect(controller.state).toBe(before);
  });

  it('advances in fixed steps and returns an interpolation factor in [0, 1)', () => {
    const { controller } = setup();
    init(controller);
    controller.onCommand('confirm');
    const alpha = controller.tick(0.1);
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
    expect(controller.state.time).toBeCloseTo(0.1, 2);
  });

  it('clamps very long frames so a stall does not run many steps', () => {
    const { controller } = setup();
    init(controller);
    controller.onCommand('confirm');
    controller.tick(10);
    expect(controller.state.time).toBeLessThanOrEqual(0.25 + CONFIG.FIXED_DT);
  });
});
