// Keyboard and pointer (drag / tap) mapping to game actions. DOM-free so it is testable in node.
import type { InputAction } from './game/types';

export type Command = 'pause' | 'confirm' | 'restart' | 'mute';

export interface KeyMapping {
  action?: InputAction;
  command?: Command;
}

/** Maps a KeyboardEvent.key value. Returns null for keys the game does not use. */
export function keyToInput(key: string): KeyMapping | null {
  switch (key) {
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return { action: 'left' };
    case 'ArrowRight':
    case 'd':
    case 'D':
      return { action: 'right' };
    case 'ArrowUp':
    case 'w':
    case 'W':
    case ' ':
    case 'Spacebar':
      // Jump also confirms, so Space starts a run from the title and menus.
      return { action: 'jump', command: 'confirm' };
    case 'ArrowDown':
    case 's':
    case 'S':
      return { action: 'slide' };
    case 'p':
    case 'P':
    case 'Escape':
      return { command: 'pause' };
    case 'r':
    case 'R':
      return { command: 'restart' };
    case 'm':
    case 'M':
      return { command: 'mute' };
    case 'Enter':
      return { command: 'confirm' };
    default:
      return null;
  }
}

/**
 * Converts a drag vector into an action using the dominant axis. Returns null if the drag is
 * shorter than `threshold` pixels on that axis.
 */
export function swipeToAction(dx: number, dy: number, threshold = 30): InputAction | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < threshold) return null;
  if (ax >= ay) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'jump' : 'slide';
}

/** Minimal event target shape so attachInput can run against a fake target in tests. */
export interface EventTargetLike {
  // `any` is required so that the DOM Window overloads (typed with WindowEventMap) remain assignable.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export interface InputHandlers {
  onAction(a: InputAction): void;
  onCommand(c: Command): void;
}

interface KeyEventLike {
  key: string;
  repeat: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: unknown;
  preventDefault(): void;
}

interface PointerEventLike {
  pointerId?: number;
  button?: number;
  clientX: number;
  clientY: number;
  target?: unknown;
}

/** A pointer that moves less than this many pixels counts as a tap. */
const TAP_SLOP = 10;

/** Keys that the browser turns into a click when a button has focus. */
const BUTTON_ACTIVATION_KEYS = new Set([' ', 'Spacebar', 'Enter']);

/** True if the event target is a button or sits inside one. Buttons handle their own clicks. */
function isInButton(target: unknown): boolean {
  const closest = (target as { closest?: unknown } | null | undefined)?.closest;
  return typeof closest === 'function' && Boolean(closest.call(target, 'button'));
}

/**
 * Listens for keys and drags on `target`. Returns a disposer that removes every listener.
 * Key repeats are ignored, and Ctrl/Cmd/Alt combinations are left alone (so reload still works).
 */
export function attachInput(target: EventTargetLike, handlers: InputHandlers): () => void {
  let start: { id: number | undefined; x: number; y: number } | null = null;

  const onKeyDown = (e: KeyEventLike): void => {
    if (e.repeat) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // A focused button turns Space/Enter into its click handler. Leave the key to the browser so
    // the button is the only thing that reacts to it (otherwise one press starts a run twice).
    if (BUTTON_ACTIVATION_KEYS.has(e.key) && isInButton(e.target)) return;
    const mapping = keyToInput(e.key);
    if (!mapping) return;
    e.preventDefault();
    if (mapping.action) handlers.onAction(mapping.action);
    if (mapping.command) handlers.onCommand(mapping.command);
  };

  const onPointerDown = (e: PointerEventLike): void => {
    if ((e.button ?? 0) !== 0) return;
    // Presses on a button are left to its click handler, so they never count as a tap.
    if (isInButton(e.target)) {
      start = null;
      return;
    }
    start = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };

  const onPointerUp = (e: PointerEventLike): void => {
    const s = start;
    if (!s || (s.id !== undefined && e.pointerId !== undefined && s.id !== e.pointerId)) return;
    start = null;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const action = swipeToAction(dx, dy);
    if (action) {
      handlers.onAction(action);
    } else if (Math.hypot(dx, dy) < TAP_SLOP) {
      handlers.onCommand('confirm');
    }
  };

  const onPointerCancel = (): void => {
    start = null;
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointerup', onPointerUp);
  target.addEventListener('pointercancel', onPointerCancel);

  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('pointerdown', onPointerDown);
    target.removeEventListener('pointerup', onPointerUp);
    target.removeEventListener('pointercancel', onPointerCancel);
    start = null;
  };
}
