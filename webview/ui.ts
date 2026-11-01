import type { HighScoreEntry } from '../src/messages';

/** Result of a finished run, shown on the game-over screen. */
export interface RunResult {
  score: number;
  coins: number;
  distance: number;
  durationMs: number;
}

export interface UiHandlers {
  onStart(): void;
  onResume(): void;
  onRestart(): void;
  onQuit(): void;
  onShowHighScores(): void;
  onBack(): void;
}

type Screen = 'title' | 'highScores' | 'pause' | 'gameOver' | 'none';

const TOP_N = 10;
const HIDDEN_CLASS = 'ui-hidden';

interface GameOverState {
  result: RunResult;
  list: HighScoreEntry[] | null;
  newRank?: number;
}

/** Formats milliseconds as m:ss (e.g. 75000 -> "1:15"). */
export function formatTime(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

/** Formats a distance rounded to whole metres with thousands separators (e.g. "1,234 m"). */
export function formatDistance(d: number): string {
  const safe = Number.isFinite(d) && d > 0 ? Math.round(d) : 0;
  const grouped = String(safe).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped} m`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

export class Ui {
  private readonly root: HTMLElement;
  private readonly doc: Document;
  private readonly handlers: UiHandlers;
  private current: Screen = 'none';
  private highScoresList: HighScoreEntry[] = [];
  private gameOver: GameOverState | null = null;

  constructor(root: HTMLElement, handlers: UiHandlers) {
    this.root = root;
    this.doc = root.ownerDocument;
    this.handlers = handlers;
    this.hide();
  }

  get screen(): Screen {
    return this.current;
  }

  showTitle(best: number): void {
    const logo = this.el('h1', 'logo');
    logo.setAttribute('aria-label', 'Brainrot Runners');
    for (const ch of 'BRAINROT RUNNERS') {
      logo.appendChild(this.el('span', ch === ' ' ? 'logo-char logo-gap' : 'logo-char', ch));
    }

    const controls = this.el('ul', 'controls');
    for (const line of [
      '← / → or A / D: change lane',
      '↑ / W / Space: jump',
      '↓ / S: slide',
      'P / Esc: pause',
      'M: mute',
      'Drag to swipe',
    ]) {
      controls.appendChild(this.el('li', undefined, line));
    }

    const start = this.button('Press Space to Run', 'btn btn-primary', () =>
      this.handlers.onStart(),
    );
    this.mount('title', [
      logo,
      this.el('p', 'best', `Best: ${best}`),
      start,
      this.button('High Scores', 'btn', () => this.handlers.onShowHighScores()),
      controls,
    ]);
    start.focus();
  }

  showHighScores(list: HighScoreEntry[]): void {
    this.highScoresList = list;
    this.renderHighScores();
  }

  showPause(): void {
    const resume = this.button('Resume', 'btn btn-primary', () => this.handlers.onResume());
    this.mount('pause', [
      this.el('h2', 'heading', 'PAUSED'),
      resume,
      this.button('Restart', 'btn', () => this.handlers.onRestart()),
      this.button('Quit to title', 'btn', () => this.handlers.onQuit()),
    ]);
    resume.focus();
  }

  showGameOver(result: RunResult, list: HighScoreEntry[] | null, newRank?: number): void {
    this.gameOver = { result, list, newRank };
    this.renderGameOver();
  }

  updateHighScores(list: HighScoreEntry[], newRank?: number): void {
    if (this.current === 'gameOver' && this.gameOver) {
      this.gameOver = { ...this.gameOver, list, newRank };
      this.renderGameOver();
    } else if (this.current === 'highScores') {
      this.highScoresList = list;
      this.renderHighScores();
    }
  }

  hide(): void {
    this.current = 'none';
    this.root.dataset.screen = 'none';
    this.root.classList.add(HIDDEN_CLASS);
    this.root.replaceChildren();
  }

  // ---- screen renderers -------------------------------------------------

  private renderHighScores(): void {
    const back = this.button('Back', 'btn btn-primary', () => this.handlers.onBack());
    this.mount('highScores', [
      this.el('h2', 'heading', 'High Scores'),
      this.tableOrEmpty(this.highScoresList, undefined),
      back,
    ]);
    back.focus();
  }

  private renderGameOver(): void {
    if (!this.gameOver) {
      return;
    }
    const { result, list, newRank } = this.gameOver;
    const children: HTMLElement[] = [
      this.el('h2', 'heading heading-gameover', "YOU GOT RATIO'D"),
      this.stats(result),
    ];
    if (typeof newRank === 'number') {
      children.push(this.el('div', 'banner', `NEW HIGH SCORE! #${newRank}`));
    }
    if (list === null) {
      children.push(this.el('p', 'status', 'Saving score…'));
    } else {
      children.push(this.tableOrEmpty(list, newRank));
    }
    const runAgain = this.button('Run again', 'btn btn-primary', () => this.handlers.onRestart());
    const buttonRow = this.el('div', 'button-row');
    buttonRow.append(
      runAgain,
      this.button('Title', 'btn', () => this.handlers.onQuit()),
    );
    children.push(buttonRow, this.el('p', 'hint', 'R / Enter to run again'));
    this.mount('gameOver', children);
    runAgain.focus();
  }

  // ---- building blocks --------------------------------------------------

  private stats(result: RunResult): HTMLElement {
    const box = this.el('div', 'stats');
    const rows: Array<[string, string]> = [
      ['Score', String(result.score)],
      ['Coins', String(result.coins)],
      ['Distance', formatDistance(result.distance)],
      ['Time', formatTime(result.durationMs)],
    ];
    for (const [label, value] of rows) {
      const row = this.el('div', 'stat');
      row.appendChild(this.el('span', 'stat-label', label));
      row.appendChild(this.el('span', 'stat-value', value));
      box.appendChild(row);
    }
    return box;
  }

  private tableOrEmpty(list: HighScoreEntry[], newRank: number | undefined): HTMLElement {
    if (list.length === 0) {
      return this.el('p', 'empty', 'No runs yet — go rot!');
    }
    const table = this.el('table', 'scores');
    const head = this.el('thead');
    const headRow = this.el('tr');
    for (const title of ['Rank', 'Score', 'Coins', 'Distance', 'Time', 'Date']) {
      headRow.appendChild(this.el('th', undefined, title));
    }
    head.appendChild(headRow);
    table.appendChild(head);

    const body = this.el('tbody');
    list.slice(0, TOP_N).forEach((entry, index) => {
      const highlighted = newRank !== undefined && index === newRank - 1;
      const tr = this.el('tr', highlighted ? 'row row-new' : 'row');
      tr.appendChild(this.el('td', undefined, String(index + 1)));
      tr.appendChild(this.el('td', undefined, String(entry.score)));
      tr.appendChild(this.el('td', undefined, String(entry.coins)));
      tr.appendChild(this.el('td', undefined, formatDistance(entry.distance)));
      tr.appendChild(this.el('td', undefined, formatTime(entry.durationMs)));
      tr.appendChild(this.el('td', undefined, formatDate(entry.date)));
      body.appendChild(tr);
    });
    table.appendChild(body);
    return table;
  }

  private mount(screen: Screen, children: HTMLElement[]): void {
    this.current = screen;
    this.root.dataset.screen = screen;
    const panel = this.el('div', `panel panel-${screen}`);
    panel.setAttribute('role', 'dialog');
    panel.append(...children);
    this.root.replaceChildren(panel);
    this.root.classList.remove(HIDDEN_CLASS);
  }

  private button(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const btn = this.el('button', className, label);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
  }

  private el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
  ): HTMLElementTagNameMap[K] {
    const node = this.doc.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }
}
