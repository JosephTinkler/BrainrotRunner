import { describe, expect, it } from 'vitest';
import {
  attachInput,
  keyToInput,
  swipeToAction,
  type Command,
  type EventTargetLike,
} from '../../webview/input';
import type { InputAction } from '../../webview/game/types';

describe('keyToInput', () => {
  it.each([
    ['ArrowLeft', { action: 'left' }],
    ['a', { action: 'left' }],
    ['A', { action: 'left' }],
    ['ArrowRight', { action: 'right' }],
    ['d', { action: 'right' }],
    ['D', { action: 'right' }],
    ['ArrowDown', { action: 'slide' }],
    ['s', { action: 'slide' }],
    ['S', { action: 'slide' }],
    ['p', { command: 'pause' }],
    ['P', { command: 'pause' }],
    ['Escape', { command: 'pause' }],
    ['r', { command: 'restart' }],
    ['R', { command: 'restart' }],
    ['m', { command: 'mute' }],
    ['M', { command: 'mute' }],
    ['Enter', { command: 'confirm' }],
  ])('maps %s', (key, expected) => {
    expect(keyToInput(key)).toEqual(expected);
  });

  it.each(['ArrowUp', 'w', 'W', ' '])('maps %j to jump and confirm', (key) => {
    expect(keyToInput(key)).toEqual({ action: 'jump', command: 'confirm' });
  });

  it('returns null for unrelated keys', () => {
    expect(keyToInput('x')).toBeNull();
    expect(keyToInput('Tab')).toBeNull();
    expect(keyToInput('')).toBeNull();
  });
});

describe('swipeToAction', () => {
  it('uses the dominant horizontal axis', () => {
    expect(swipeToAction(-80, 10)).toBe('left');
    expect(swipeToAction(80, -20)).toBe('right');
  });

  it('uses the dominant vertical axis', () => {
    expect(swipeToAction(10, -80)).toBe('jump');
    expect(swipeToAction(-20, 80)).toBe('slide');
  });

  it('returns null below the threshold', () => {
    expect(swipeToAction(29, 0)).toBeNull();
    expect(swipeToAction(0, -29)).toBeNull();
    expect(swipeToAction(0, 0)).toBeNull();
  });

  it('accepts a drag exactly at the threshold', () => {
    expect(swipeToAction(0, 30)).toBe('slide');
    expect(swipeToAction(-30, 0)).toBe('left');
  });

  it('honours a custom threshold', () => {
    expect(swipeToAction(50, 0, 60)).toBeNull();
    expect(swipeToAction(50, 0, 40)).toBe('right');
  });

  it('breaks exact diagonal ties towards horizontal', () => {
    expect(swipeToAction(50, 50)).toBe('right');
  });
});

/** Fake target that records listeners and lets tests dispatch events. */
function fakeTarget(): EventTargetLike & {
  dispatch(type: string, event: object): void;
  count(): number;
} {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener as (e: unknown) => void);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener as (e: unknown) => void);
    },
    dispatch(type, event) {
      for (const l of [...(listeners.get(type) ?? [])]) l(event);
    },
    count() {
      let n = 0;
      for (const set of listeners.values()) n += set.size;
      return n;
    },
  };
}

function keyEvent(key: string, extra: Record<string, unknown> = {}) {
  return {
    key,
    repeat: false,
    preventDefault: () => {
      prevented++;
    },
    ...extra,
  };
}

let prevented = 0;

describe('attachInput', () => {
  function setup() {
    const actions: InputAction[] = [];
    const commands: Command[] = [];
    const target = fakeTarget();
    const dispose = attachInput(target, {
      onAction: (a) => actions.push(a),
      onCommand: (c) => commands.push(c),
    });
    prevented = 0;
    return { target, actions, commands, dispose };
  }

  it('dispatches key actions and commands', () => {
    const { target, actions, commands } = setup();
    target.dispatch('keydown', keyEvent('ArrowLeft'));
    target.dispatch('keydown', keyEvent('p'));
    expect(actions).toEqual(['left']);
    expect(commands).toEqual(['pause']);
  });

  it('Space fires both jump and confirm, in that order', () => {
    const { target, actions, commands } = setup();
    target.dispatch('keydown', keyEvent(' '));
    expect(actions).toEqual(['jump']);
    expect(commands).toEqual(['confirm']);
  });

  it('ignores key repeats', () => {
    const { target, actions } = setup();
    target.dispatch('keydown', keyEvent('ArrowRight', { repeat: true }));
    expect(actions).toEqual([]);
    expect(prevented).toBe(0);
  });

  it('calls preventDefault only for handled keys', () => {
    const { target } = setup();
    target.dispatch('keydown', keyEvent('x'));
    expect(prevented).toBe(0);
    target.dispatch('keydown', keyEvent('ArrowDown'));
    expect(prevented).toBe(1);
  });

  it('leaves Ctrl, Meta and Alt combinations alone', () => {
    const { target, actions } = setup();
    target.dispatch('keydown', keyEvent('r', { ctrlKey: true }));
    target.dispatch('keydown', keyEvent('a', { metaKey: true }));
    target.dispatch('keydown', keyEvent('d', { altKey: true }));
    expect(actions).toEqual([]);
  });

  it('turns a fast drag into an action', () => {
    const { target, actions, commands } = setup();
    target.dispatch('pointerdown', { pointerId: 1, clientX: 100, clientY: 300 });
    target.dispatch('pointerup', { pointerId: 1, clientX: 100, clientY: 220 });
    expect(actions).toEqual(['jump']);
    expect(commands).toEqual([]);
  });

  it('treats a tap without movement as confirm', () => {
    const { target, actions, commands } = setup();
    target.dispatch('pointerdown', { pointerId: 1, clientX: 100, clientY: 300 });
    target.dispatch('pointerup', { pointerId: 1, clientX: 103, clientY: 302 });
    expect(actions).toEqual([]);
    expect(commands).toEqual(['confirm']);
  });

  it('ignores a short drag that is neither a swipe nor a tap', () => {
    const { target, actions, commands } = setup();
    target.dispatch('pointerdown', { pointerId: 1, clientX: 100, clientY: 300 });
    target.dispatch('pointerup', { pointerId: 1, clientX: 120, clientY: 300 });
    expect(actions).toEqual([]);
    expect(commands).toEqual([]);
  });

  it('ignores pointerup from a different pointer', () => {
    const { target, actions, commands } = setup();
    target.dispatch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
    target.dispatch('pointerup', { pointerId: 2, clientX: 0, clientY: 0 });
    expect(actions).toEqual([]);
    expect(commands).toEqual([]);
  });

  it('ignores secondary mouse buttons', () => {
    const { target, commands } = setup();
    target.dispatch('pointerdown', { pointerId: 1, button: 2, clientX: 0, clientY: 0 });
    target.dispatch('pointerup', { pointerId: 1, button: 2, clientX: 0, clientY: 0 });
    expect(commands).toEqual([]);
  });

  it('cancelled pointers do not produce a tap', () => {
    const { target, commands } = setup();
    target.dispatch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
    target.dispatch('pointercancel', { pointerId: 1, clientX: 0, clientY: 0 });
    target.dispatch('pointerup', { pointerId: 1, clientX: 0, clientY: 0 });
    expect(commands).toEqual([]);
  });

  it('the disposer removes every listener and stops dispatch', () => {
    const { target, actions, commands, dispose } = setup();
    expect(target.count()).toBe(4);
    dispose();
    expect(target.count()).toBe(0);
    target.dispatch('keydown', keyEvent('ArrowLeft'));
    target.dispatch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
    target.dispatch('pointerup', { pointerId: 1, clientX: 0, clientY: 0 });
    expect(actions).toEqual([]);
    expect(commands).toEqual([]);
  });

  describe('when a button is the event target', () => {
    /** Minimal stand-in for a DOM element: `inButton` decides whether closest('button') matches. */
    function elementIn(inButton: boolean) {
      return {
        closest: (selector: string) => (inButton && selector === 'button' ? {} : null),
      };
    }

    it('a tap on a button does not also emit confirm', () => {
      const { target, commands } = setup();
      const button = elementIn(true);
      target.dispatch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0, target: button });
      target.dispatch('pointerup', { pointerId: 1, clientX: 0, clientY: 0, target: button });
      expect(commands).toEqual([]);
    });

    it('a tap on a non-button element still confirms', () => {
      const { target, commands } = setup();
      const panel = elementIn(false);
      target.dispatch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0, target: panel });
      target.dispatch('pointerup', { pointerId: 1, clientX: 0, clientY: 0, target: panel });
      expect(commands).toEqual(['confirm']);
    });

    it('a drag that starts on a button is ignored', () => {
      const { target, actions } = setup();
      const button = elementIn(true);
      target.dispatch('pointerdown', { pointerId: 1, clientX: 100, clientY: 300, target: button });
      target.dispatch('pointerup', { pointerId: 1, clientX: 100, clientY: 200, target: button });
      expect(actions).toEqual([]);
    });

    it('Space and Enter on a focused button are left to the browser click', () => {
      const { target, actions, commands } = setup();
      const button = elementIn(true);
      target.dispatch('keydown', keyEvent(' ', { target: button }));
      target.dispatch('keydown', keyEvent('Enter', { target: button }));
      expect(actions).toEqual([]);
      expect(commands).toEqual([]);
      expect(prevented).toBe(0);
    });

    it('other game keys still work while a button is focused', () => {
      const { target, actions, commands } = setup();
      const button = elementIn(true);
      target.dispatch('keydown', keyEvent('ArrowLeft', { target: button }));
      target.dispatch('keydown', keyEvent('p', { target: button }));
      expect(actions).toEqual(['left']);
      expect(commands).toEqual(['pause']);
    });

    it('Space still jumps and confirms when the target is not a button', () => {
      const { target, actions, commands } = setup();
      target.dispatch('keydown', keyEvent(' ', { target: elementIn(false) }));
      expect(actions).toEqual(['jump']);
      expect(commands).toEqual(['confirm']);
    });
  });

  it('a second attach has independent listeners', () => {
    const a = setup();
    const b = setup();
    a.dispose();
    b.target.dispatch('keydown', keyEvent('ArrowUp'));
    expect(b.actions).toEqual(['jump']);
    expect(a.actions).toEqual([]);
  });
});
