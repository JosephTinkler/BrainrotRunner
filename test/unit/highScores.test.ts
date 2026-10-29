import { describe, expect, it } from 'vitest';
import { HighScoreStore, MAX_ENTRIES, MementoLike, STORAGE_KEY } from '../../src/highScores';
import type { HighScoreEntry } from '../../src/messages';

function createMemento(
  initial: Record<string, unknown> = {},
): MementoLike & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    data,
    get<T>(key: string): T | undefined {
      return data.get(key) as T | undefined;
    },
    update(key: string, value: unknown): Promise<void> {
      data.set(key, value);
      return Promise.resolve();
    },
  };
}

const DAY = '2026-01-01T00:00:00.000Z';

function run(score: number, date = DAY) {
  return { score, coins: 1, distance: 100, durationMs: 5000, date };
}

describe('HighScoreStore', () => {
  it('starts with an empty list', () => {
    const store = new HighScoreStore(createMemento());
    expect(store.list()).toEqual([]);
  });

  it('sorts entries by score descending', async () => {
    const store = new HighScoreStore(createMemento());
    await store.submit(run(50));
    await store.submit(run(200));
    await store.submit(run(120));
    expect(store.list().map((e) => e.score)).toEqual([200, 120, 50]);
  });

  it('keeps only the top 10 entries', async () => {
    const store = new HighScoreStore(createMemento());
    for (let i = 1; i <= 12; i++) {
      await store.submit(run(i * 10, `2026-01-${String(i).padStart(2, '0')}T00:00:00.000Z`));
    }
    const list = store.list();
    expect(MAX_ENTRIES).toBe(10);
    expect(list).toHaveLength(10);
    expect(list[0].score).toBe(120);
    expect(list[9].score).toBe(30);
  });

  it('reports the 1-based rank of a placing run', async () => {
    const store = new HighScoreStore(createMemento());
    await store.submit(run(100));
    const result = await store.submit(run(300));
    expect(result.rank).toBe(1);
    const middle = await store.submit(run(200));
    expect(middle.rank).toBe(2);
  });

  it('returns null rank when a run does not make the top 10', async () => {
    const store = new HighScoreStore(createMemento());
    for (let i = 1; i <= 10; i++) {
      await store.submit(run(i * 100));
    }
    const result = await store.submit(run(5));
    expect(result.rank).toBeNull();
    expect(result.list).toHaveLength(10);
    expect(result.list.some((e) => e.score === 5)).toBe(false);
  });

  it('breaks score ties in favour of the earlier date', async () => {
    const store = new HighScoreStore(createMemento());
    const later = await store.submit(run(500, '2026-02-01T00:00:00.000Z'));
    expect(later.rank).toBe(1);
    const earlier = await store.submit(run(500, '2026-01-01T00:00:00.000Z'));
    expect(earlier.rank).toBe(1);
    expect(store.list().map((e) => e.date)).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z',
    ]);
  });

  it('drops malformed stored entries on load', () => {
    const valid: HighScoreEntry = {
      score: 5,
      coins: 2,
      distance: 30,
      durationMs: 1000,
      date: DAY,
    };
    const memento = createMemento({
      [STORAGE_KEY]: [
        null,
        { score: 'x' },
        valid,
        { ...valid, score: -1 },
        { ...valid, coins: Number.NaN },
        { ...valid, distance: Number.POSITIVE_INFINITY },
        { ...valid, durationMs: '1000' },
        { ...valid, date: 'not a date' },
        { ...valid, date: 42 },
        'garbage',
      ],
    });
    const store = new HighScoreStore(memento);
    expect(store.list()).toEqual([valid]);
  });

  it('treats non-array stored data as empty', () => {
    const store = new HighScoreStore(createMemento({ [STORAGE_KEY]: { score: 5 } }));
    expect(store.list()).toEqual([]);
  });

  it('rejects invalid submissions without storing them', async () => {
    const store = new HighScoreStore(createMemento());
    const bad = [
      { ...run(10), score: Number.NaN },
      { ...run(10), score: -5 },
      { ...run(10), coins: Number.POSITIVE_INFINITY },
      { ...run(10), distance: -1 },
      { ...run(10), durationMs: Number.NaN },
      { ...run(10), date: 'nope' },
    ];
    for (const entry of bad) {
      const result = await store.submit(entry);
      expect(result.rank).toBeNull();
    }
    expect(store.list()).toEqual([]);
  });

  it('floors score and coins on submit', async () => {
    const store = new HighScoreStore(createMemento());
    const result = await store.submit({ ...run(42.9), coins: 3.7 });
    expect(result.rank).toBe(1);
    expect(store.list()[0].score).toBe(42);
    expect(store.list()[0].coins).toBe(3);
  });

  it('fills in a date when none is given', async () => {
    const store = new HighScoreStore(createMemento());
    const result = await store.submit({ score: 10, coins: 1, distance: 100, durationMs: 5000 });
    expect(result.rank).toBe(1);
    expect(Number.isNaN(Date.parse(store.list()[0].date))).toBe(false);
  });

  it('reset clears all entries', async () => {
    const store = new HighScoreStore(createMemento());
    await store.submit(run(10));
    await store.reset();
    expect(store.list()).toEqual([]);
  });

  it('persists through the memento across store instances', async () => {
    const memento = createMemento();
    await new HighScoreStore(memento).submit(run(77));
    const reopened = new HighScoreStore(memento);
    expect(reopened.list().map((e) => e.score)).toEqual([77]);
    expect(memento.data.get(STORAGE_KEY)).toHaveLength(1);
  });
});
