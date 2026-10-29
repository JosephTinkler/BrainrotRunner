import { describe, expect, it } from 'vitest';
import { VIEW_TYPE } from '../../src/messages';

describe('messages', () => {
  it('exposes the game view type', () => {
    expect(VIEW_TYPE).toBe('brainrotRunners.game');
  });
});
