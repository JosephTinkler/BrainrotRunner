/** Shared typed message contracts between the extension host and the webview. */

export const VIEW_TYPE = 'brainrotRunners.game';
/** The Activity Bar sidebar view. Must match `contributes.views` in package.json. */
export const SIDEBAR_VIEW_ID = 'brainrotRunners.sidebar';

export interface HighScoreEntry {
  score: number;
  coins: number;
  distance: number;
  durationMs: number;
  date: string;
}

export interface Settings {
  sound: boolean;
  reducedMotion: boolean;
}

/** Messages sent from the webview to the extension host. */
export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'gameOver'; score: number; coins: number; distance: number; durationMs: number }
  | { type: 'requestHighScores' }
  /** The player toggled sound; the host saves it to the `brainrotRunners.sound` setting. */
  | { type: 'setSound'; on: boolean };

/** Messages sent from the extension host to the webview. */
export type HostToWebview =
  | {
      type: 'init';
      highScores: HighScoreEntry[];
      settings: Settings;
      view?: 'title' | 'highScores';
    }
  | { type: 'highScores'; list: HighScoreEntry[]; newRank?: number }
  /** The webview was hidden by the host; pause a run in progress. */
  | { type: 'pause' };
