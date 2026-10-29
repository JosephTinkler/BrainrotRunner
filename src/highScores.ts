import type { HighScoreEntry } from './messages';

/**
 * Minimal subset of vscode.Memento. Kept as an interface so this module
 * does not import 'vscode' at runtime and can be unit tested directly.
 */
export interface MementoLike {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

export const STORAGE_KEY = 'brainrotRunners.highScores';
export const MAX_ENTRIES = 10;

export type SubmitInput = Omit<HighScoreEntry, 'date'> & { date?: string };

export class HighScoreStore {
  constructor(private readonly memento: MementoLike) {}

  /** Returns the saved top scores, sorted and sanitized. */
  list(): HighScoreEntry[] {
    return normalizeList(this.memento.get<unknown>(STORAGE_KEY));
  }

  /**
   * Adds a run to the leaderboard. Returns the updated list and the 1-based
   * rank of the new entry, or null if it did not place (or was invalid, in
   * which case nothing is stored).
   */
  async submit(entry: SubmitInput): Promise<{ list: HighScoreEntry[]; rank: number | null }> {
    const candidate = parseEntry({
      ...entry,
      score: floorIfNumber(entry.score),
      coins: floorIfNumber(entry.coins),
      date: entry.date ?? new Date().toISOString(),
    });

    if (!candidate) {
      return { list: this.list(), rank: null };
    }

    const entries = this.list();
    entries.push(candidate);
    const kept = sortEntries(entries).slice(0, MAX_ENTRIES);
    const index = kept.indexOf(candidate);

    await this.memento.update(STORAGE_KEY, kept);
    return { list: kept, rank: index === -1 ? null : index + 1 };
  }

  /** Clears all saved high scores. */
  async reset(): Promise<void> {
    await this.memento.update(STORAGE_KEY, []);
  }
}

function floorIfNumber(value: unknown): unknown {
  return typeof value === 'number' ? Math.floor(value) : value;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Returns a clean entry, or null if the raw value is malformed. */
function parseEntry(raw: unknown): HighScoreEntry | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  if (
    !isNonNegativeNumber(r.score) ||
    !isNonNegativeNumber(r.coins) ||
    !isNonNegativeNumber(r.distance) ||
    !isNonNegativeNumber(r.durationMs)
  ) {
    return null;
  }
  if (typeof r.date !== 'string' || Number.isNaN(Date.parse(r.date))) {
    return null;
  }
  return {
    score: r.score,
    coins: r.coins,
    distance: r.distance,
    durationMs: r.durationMs,
    date: r.date,
  };
}

function normalizeList(raw: unknown): HighScoreEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const entries = raw.map(parseEntry).filter((entry): entry is HighScoreEntry => entry !== null);
  return sortEntries(entries).slice(0, MAX_ENTRIES);
}

/** Score descending; ties go to the earlier date. Sorts in place and returns the array. */
function sortEntries(entries: HighScoreEntry[]): HighScoreEntry[] {
  return entries.sort((a, b) => b.score - a.score || Date.parse(a.date) - Date.parse(b.date));
}
