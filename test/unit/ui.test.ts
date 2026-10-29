// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Ui, formatTime, formatDistance, type UiHandlers, type RunResult } from '../../webview/ui';
import type { HighScoreEntry } from '../../src/messages';

function entry(score: number, overrides: Partial<HighScoreEntry> = {}): HighScoreEntry {
  return {
    score,
    coins: 3,
    distance: 1234.6,
    durationMs: 75_000,
    date: '2026-01-02T03:04:05.000Z',
    ...overrides,
  };
}

const RESULT: RunResult = { score: 999, coins: 42, distance: 2500, durationMs: 61_000 };

function makeHandlers(): UiHandlers {
  return {
    onStart: vi.fn(),
    onResume: vi.fn(),
    onRestart: vi.fn(),
    onQuit: vi.fn(),
    onShowHighScores: vi.fn(),
    onBack: vi.fn(),
  };
}

function buttonByText(root: HTMLElement, text: string): HTMLButtonElement {
  const match = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === text);
  if (!match) {
    throw new Error(`no button "${text}"`);
  }
  return match;
}

describe('formatTime', () => {
  it('formats milliseconds as m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5_000)).toBe('0:05');
    expect(formatTime(75_999)).toBe('1:15');
    expect(formatTime(600_000)).toBe('10:00');
  });

  it('treats invalid input as zero', () => {
    expect(formatTime(-1)).toBe('0:00');
    expect(formatTime(Number.NaN)).toBe('0:00');
  });
});

describe('formatDistance', () => {
  it('rounds and groups thousands', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(12.4)).toBe('12 m');
    expect(formatDistance(1234.6)).toBe('1,235 m');
    expect(formatDistance(1234567)).toBe('1,234,567 m');
  });
});

describe('Ui', () => {
  let root: HTMLElement;
  let handlers: UiHandlers;
  let ui: Ui;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    root.id = 'ui';
    document.body.appendChild(root);
    handlers = makeHandlers();
    ui = new Ui(root, handlers);
  });

  it('starts hidden with screen none', () => {
    expect(ui.screen).toBe('none');
    expect(root.classList.contains('ui-hidden')).toBe(true);
  });

  describe('title', () => {
    beforeEach(() => ui.showTitle(4321));

    it('renders logo, best score and controls summary', () => {
      expect(ui.screen).toBe('title');
      expect(root.querySelector('h1.logo')?.getAttribute('aria-label')).toBe('Brainrot Runners');
      expect(root.querySelector('h1.logo')?.textContent).toBe('BRAINROT RUNNERS');
      expect(root.textContent).toContain('Best: 4321');
      const items = Array.from(root.querySelectorAll('li')).map((li) => li.textContent);
      expect(items).toEqual(
        expect.arrayContaining([
          expect.stringContaining('A / D'),
          expect.stringContaining('Space: jump'),
          expect.stringContaining('S: slide'),
          expect.stringContaining('P / Esc'),
          expect.stringContaining('Drag to swipe'),
        ]),
      );
    });

    it('invokes onStart and onShowHighScores from its buttons', () => {
      buttonByText(root, 'Press Space to Run').click();
      expect(handlers.onStart).toHaveBeenCalledTimes(1);
      buttonByText(root, 'High Scores').click();
      expect(handlers.onShowHighScores).toHaveBeenCalledTimes(1);
    });

    it('focuses the primary button', () => {
      expect(document.activeElement).toBe(buttonByText(root, 'Press Space to Run'));
    });

    it('makes the overlay visible', () => {
      expect(root.classList.contains('ui-hidden')).toBe(false);
    });
  });

  describe('high scores', () => {
    it('renders rank, score, coins, distance, time and date', () => {
      ui.showHighScores([entry(500), entry(300)]);
      expect(ui.screen).toBe('highScores');
      const rows = root.querySelectorAll('tbody tr');
      expect(rows.length).toBe(2);
      const firstCells = Array.from(rows[0].querySelectorAll('td')).map((c) => c.textContent);
      expect(firstCells[0]).toBe('1');
      expect(firstCells[1]).toBe('500');
      expect(firstCells[2]).toBe('3');
      expect(firstCells[3]).toBe('1,235 m');
      expect(firstCells[4]).toBe('1:15');
      expect(firstCells[5]).toBe(new Date(entry(0).date).toLocaleDateString());
    });

    it('shows only the top 10 entries', () => {
      ui.showHighScores(Array.from({ length: 15 }, (_, i) => entry(100 - i)));
      expect(root.querySelectorAll('tbody tr').length).toBe(10);
    });

    it('shows the empty state when there are no runs', () => {
      ui.showHighScores([]);
      expect(root.textContent).toContain('No runs yet — go rot!');
      expect(root.querySelector('table')).toBeNull();
    });

    it('invokes onBack', () => {
      ui.showHighScores([]);
      buttonByText(root, 'Back').click();
      expect(handlers.onBack).toHaveBeenCalledTimes(1);
    });

    it('re-renders when updateHighScores is called on this screen', () => {
      ui.showHighScores([]);
      ui.updateHighScores([entry(70)]);
      expect(root.querySelectorAll('tbody tr').length).toBe(1);
      expect(root.textContent).not.toContain('No runs yet');
    });
  });

  describe('pause', () => {
    beforeEach(() => ui.showPause());

    it('renders the paused heading and buttons that invoke handlers', () => {
      expect(ui.screen).toBe('pause');
      expect(root.textContent).toContain('PAUSED');
      buttonByText(root, 'Resume').click();
      buttonByText(root, 'Restart').click();
      buttonByText(root, 'Quit to title').click();
      expect(handlers.onResume).toHaveBeenCalledTimes(1);
      expect(handlers.onRestart).toHaveBeenCalledTimes(1);
      expect(handlers.onQuit).toHaveBeenCalledTimes(1);
    });

    it('focuses Resume', () => {
      expect(document.activeElement).toBe(buttonByText(root, 'Resume'));
    });
  });

  describe('game over', () => {
    it('shows heading, score breakdown and the saving state when list is null', () => {
      ui.showGameOver(RESULT, null);
      expect(ui.screen).toBe('gameOver');
      expect(root.textContent).toContain("YOU GOT RATIO'D");
      expect(root.textContent).toContain('999');
      expect(root.textContent).toContain('42');
      expect(root.textContent).toContain('2,500 m');
      expect(root.textContent).toContain('1:01');
      expect(root.textContent).toContain('Saving score…');
      expect(root.querySelector('table')).toBeNull();
      expect(root.querySelector('.banner')).toBeNull();
      expect(root.textContent).toContain('R / Enter to run again');
    });

    it('fills the table and highlights the new row when updateHighScores arrives', () => {
      ui.showGameOver(RESULT, null);
      const list = [entry(999), entry(500), entry(300)];
      ui.updateHighScores(list, 1);
      expect(root.textContent).not.toContain('Saving score…');
      const rows = root.querySelectorAll('tbody tr');
      expect(rows.length).toBe(3);
      expect(rows[0].classList.contains('row-new')).toBe(true);
      expect(rows[1].classList.contains('row-new')).toBe(false);
      expect(root.querySelector('.banner')?.textContent).toBe('NEW HIGH SCORE! #1');
    });

    it('highlights row newRank-1 and shows the banner', () => {
      ui.showGameOver(RESULT, [entry(900), entry(800), entry(700)], 2);
      const rows = root.querySelectorAll('tbody tr');
      expect(rows[1].classList.contains('row-new')).toBe(true);
      expect(root.querySelectorAll('tr.row-new').length).toBe(1);
      expect(root.querySelector('.banner')?.textContent).toContain('NEW HIGH SCORE! #2');
    });

    it('shows no banner or highlight when the run did not place', () => {
      ui.showGameOver(RESULT, [entry(900)]);
      expect(root.querySelector('.banner')).toBeNull();
      expect(root.querySelectorAll('tr.row-new').length).toBe(0);
    });

    it('shows the empty state when the list is empty', () => {
      ui.showGameOver(RESULT, []);
      expect(root.textContent).toContain('No runs yet — go rot!');
    });

    it('invokes onRestart and onQuit', () => {
      ui.showGameOver(RESULT, null);
      buttonByText(root, 'Run again').click();
      buttonByText(root, 'Title').click();
      expect(handlers.onRestart).toHaveBeenCalledTimes(1);
      expect(handlers.onQuit).toHaveBeenCalledTimes(1);
    });

    it('focuses Run again', () => {
      ui.showGameOver(RESULT, null);
      expect(document.activeElement).toBe(buttonByText(root, 'Run again'));
    });

    it('ignores updateHighScores when a different screen is showing', () => {
      ui.showPause();
      ui.updateHighScores([entry(1)], 1);
      expect(ui.screen).toBe('pause');
      expect(root.querySelector('tbody')).toBeNull();
    });
  });

  it('hide() hides the overlay and sets screen to none', () => {
    ui.showTitle(0);
    ui.hide();
    expect(ui.screen).toBe('none');
    expect(root.classList.contains('ui-hidden')).toBe(true);
    expect(root.children.length).toBe(0);
  });

  it('never writes style attributes from its HTML', () => {
    ui.showTitle(1);
    ui.showGameOver(RESULT, [entry(1)], 1);
    ui.showHighScores([entry(1)]);
    ui.showPause();
    expect(root.innerHTML).not.toContain('style="');
    expect(root.querySelector('[style]')).toBeNull();
  });
});
