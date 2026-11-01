// Glue between the DOM-free game logic and the webview shell (UI overlays, audio, host messages).
// Everything here is testable in node with fake dependencies.
import type { HighScoreEntry, HostToWebview, Settings, WebviewToHost } from '../src/messages';
import { CONFIG } from './game/config';
import { createInitialState } from './game/state';
import { startRun as startRunState, togglePause, update } from './game/update';
import type { GameState, InputAction } from './game/types';
import type { Command } from './input';
import type { RunResult, Ui, UiHandlers } from './ui';
import type { Sfx } from './audio';

/** Longest frame the simulation will catch up on, so a stall (tab switch, debugger) cannot spiral. */
const MAX_FRAME_DT = 0.25;

export interface ControllerDeps {
  ui: Pick<
    Ui,
    | 'showTitle'
    | 'showHighScores'
    | 'showPause'
    | 'showGameOver'
    | 'updateHighScores'
    | 'hide'
    | 'screen'
  >;
  sfx: Sfx;
  post(msg: WebviewToHost): void;
  /** Monotonic clock in milliseconds. */
  now(): number;
  /** Seed for a new run. */
  seed(): number;
  /** Optional: toggles the reduced-motion body class (applied on init). */
  setReducedMotion?(on: boolean): void;
  /** Optional: called with the sound state on init and whenever it is toggled (updates the mute button). */
  onSoundChanged?(on: boolean): void;
}

const DEFAULT_SETTINGS: Settings = { sound: true, reducedMotion: false };

function bestScore(list: readonly HighScoreEntry[]): number {
  return list.reduce((max, entry) => Math.max(max, entry.score), 0);
}

export class GameController {
  state: GameState;
  best = 0;
  highScores: HighScoreEntry[] = [];
  settings: Settings = { ...DEFAULT_SETTINGS };

  private readonly deps: ControllerDeps;
  private pendingActions: InputAction[] = [];
  private accumulator = 0;
  private runStartedAt = 0;

  constructor(deps: ControllerDeps) {
    this.deps = deps;
    this.state = createInitialState(deps.seed(), 'title');
  }

  /** Time the current run was started, from deps.now(). */
  get runStartMs(): number {
    return this.runStartedAt;
  }

  /** Shows the title before the host has sent init (best score 0 until then). */
  start(): void {
    this.deps.ui.showTitle(this.best);
  }

  handleHostMessage(msg: HostToWebview): void {
    switch (msg.type) {
      case 'init': {
        this.highScores = msg.highScores;
        this.settings = msg.settings;
        this.best = bestScore(msg.highScores);
        this.deps.sfx.setEnabled(msg.settings.sound);
        this.deps.setReducedMotion?.(msg.settings.reducedMotion);
        this.deps.onSoundChanged?.(msg.settings.sound);
        if (msg.view === 'highScores') {
          // Opening the table over a live run abandons that run, so it never keeps ticking behind it.
          if (this.isActive()) this.quitToTitle();
          this.deps.ui.showHighScores(this.highScores);
        } else if (!this.isActive()) {
          this.deps.ui.showTitle(this.best);
        }
        break;
      }
      case 'highScores': {
        this.highScores = msg.list;
        this.best = bestScore(msg.list);
        if (this.deps.ui.screen === 'title') {
          this.deps.ui.showTitle(this.best);
        }
        this.deps.ui.updateHighScores(msg.list, msg.newRank);
        break;
      }
      case 'pause':
        this.onVisibilityHidden();
        break;
    }
  }

  /** Queues a game action. Only takes effect while running; the sound plays when it really applies. */
  onAction(action: InputAction): void {
    if (this.state.phase !== 'running') return;
    this.pendingActions.push(action);
  }

  onCommand(command: Command): void {
    switch (command) {
      case 'pause':
        if (this.state.phase === 'running') {
          this.pause();
        } else if (this.state.phase === 'paused') {
          this.resume();
        }
        break;
      case 'confirm':
        if (this.deps.ui.screen === 'highScores') {
          this.deps.ui.showTitle(this.best);
        } else if (
          (this.deps.ui.screen === 'title' || this.deps.ui.screen === 'gameOver') &&
          (this.state.phase === 'title' || this.state.phase === 'gameover')
        ) {
          this.startRun();
        }
        break;
      case 'restart':
        if (this.state.phase === 'paused' || this.state.phase === 'gameover') {
          this.startRun();
        }
        break;
      case 'mute':
        this.toggleSound();
        break;
    }
  }

  /** Flips sound on or off, tells the host to save it, and updates the mute button. Works in any phase. */
  toggleSound(): void {
    const on = !this.settings.sound;
    this.settings = { ...this.settings, sound: on };
    this.deps.sfx.setEnabled(on);
    this.deps.post({ type: 'setSound', on });
    this.deps.onSoundChanged?.(on);
  }

  /** Auto-pause when the panel is hidden or loses focus. */
  onVisibilityHidden(): void {
    if (this.state.phase === 'running') {
      this.pause();
    }
  }

  /** Handlers for the UI overlays. Ui keeps a reference, so these may be filled in after construction. */
  uiHandlers(): UiHandlers {
    return {
      onStart: () => this.startRun(),
      onResume: () => this.resume(),
      onRestart: () => this.startRun(),
      onQuit: () => this.quitToTitle(),
      onShowHighScores: () => {
        this.deps.post({ type: 'requestHighScores' });
        this.deps.ui.showHighScores(this.highScores);
      },
      onBack: () => this.deps.ui.showTitle(this.best),
    };
  }

  /**
   * Advances the simulation by the frame time using a fixed timestep. Returns the interpolation
   * factor (0..1) for the renderer.
   */
  tick(dtSeconds: number): number {
    const frame = Number.isFinite(dtSeconds) ? Math.min(Math.max(dtSeconds, 0), MAX_FRAME_DT) : 0;
    if (!this.isSimulating()) {
      this.accumulator = 0;
      this.pendingActions = [];
      return 0;
    }

    this.accumulator += frame;
    // Actions are applied on the first substep only. If no substep runs this frame, they wait.
    let actions = this.pendingActions;
    while (this.accumulator >= CONFIG.FIXED_DT && this.isSimulating()) {
      this.accumulator -= CONFIG.FIXED_DT;
      this.step(actions);
      actions = [];
    }
    this.pendingActions = actions;
    if (!this.isSimulating()) {
      this.accumulator = 0;
    }
    return this.accumulator / CONFIG.FIXED_DT;
  }

  private step(actions: InputAction[]): void {
    const before = this.state;
    const after = update(before, actions, CONFIG.FIXED_DT);
    this.state = after;

    if (after.coins > before.coins) this.deps.sfx.coin();
    // Rising edges of the jump and slide timers mean the action really took effect this substep.
    if (after.player.jumpT >= 0 && before.player.jumpT < 0) this.deps.sfx.jump();
    if (after.player.slideT >= 0 && before.player.slideT < 0) this.deps.sfx.slide();
    if (before.phase !== 'crashed' && after.phase === 'crashed') this.deps.sfx.crash();
    if (before.phase !== 'gameover' && after.phase === 'gameover') this.finishRun(after);
  }

  private finishRun(s: GameState): void {
    const result: RunResult = {
      score: s.score,
      coins: s.coins,
      distance: Math.round(s.distance),
      durationMs: Math.round(s.time * 1000),
    };
    this.deps.post({ type: 'gameOver', ...result });
    this.deps.ui.showGameOver(result, null);
  }

  private startRun(): void {
    this.state = startRunState(this.deps.seed());
    this.pendingActions = [];
    this.accumulator = 0;
    this.runStartedAt = this.deps.now();
    this.deps.ui.hide();
  }

  private pause(): void {
    this.state = togglePause(this.state);
    this.pendingActions = [];
    this.accumulator = 0;
    this.deps.ui.showPause();
  }

  private resume(): void {
    if (this.state.phase !== 'paused') return;
    this.state = togglePause(this.state);
    this.accumulator = 0;
    this.deps.ui.hide();
  }

  private quitToTitle(): void {
    this.state = createInitialState(this.deps.seed(), 'title');
    this.pendingActions = [];
    this.accumulator = 0;
    this.deps.ui.showTitle(this.best);
  }

  private isActive(): boolean {
    const p = this.state.phase;
    return p === 'running' || p === 'paused' || p === 'crashed';
  }

  private isSimulating(): boolean {
    const p = this.state.phase;
    return p === 'running' || p === 'crashed';
  }
}
