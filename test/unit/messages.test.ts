import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SIDEBAR_VIEW_ID, VIEW_TYPE } from '../../src/messages';

describe('messages', () => {
  it('exposes the game view type', () => {
    expect(VIEW_TYPE).toBe('brainrotRunners.game');
  });

  it('sidebar view id matches the view contributed in package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const views = pkg.contributes.views.brainrotRunners as { id: string; type: string }[];
    expect(views).toEqual([expect.objectContaining({ id: SIDEBAR_VIEW_ID, type: 'webview' })]);

    const container = pkg.contributes.viewsContainers.activitybar[0];
    expect(container.id).toBe('brainrotRunners');
    expect(() => readFileSync(container.icon)).not.toThrow();
  });
});
