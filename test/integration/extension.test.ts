import * as assert from 'assert';
import * as vscode from 'vscode';
import type { BrainrotRunnersApi } from '../../src/extension';

const EXTENSION_ID = 'JosephTinkler.brainrot-runners';

function findGameTab(): vscode.Tab | undefined {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .find(
      (tab) =>
        tab.input instanceof vscode.TabInputWebview &&
        tab.input.viewType.endsWith('brainrotRunners.game'),
    );
}

describe('Extension', () => {
  it('activates', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} should be installed`);
    await extension.activate();
    assert.strictEqual(extension.isActive, true);
  });

  it('play command opens a game webview tab', async () => {
    await vscode.commands.executeCommand('brainrotRunners.play');
    // Tabs are updated asynchronously; poll briefly for the webview tab.
    const deadline = Date.now() + 5000;
    let tab = findGameTab();
    while (!tab && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      tab = findGameTab();
    }
    assert.ok(tab, 'a brainrotRunners.game webview tab should be open');
  });

  it('sidebar view can be focused', async () => {
    // VS Code generates `<viewId>.focus` for every contributed view; it rejects if the view is unknown.
    await vscode.commands.executeCommand('brainrotRunners.sidebar.focus');
  });

  it('high scores can be submitted and reset', async () => {
    const extension = vscode.extensions.getExtension<BrainrotRunnersApi>(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} should be installed`);
    const api = await extension.activate();
    const { store } = api;

    await store.reset();
    const result = await store.submit({
      score: 1234,
      coins: 5,
      distance: 300,
      durationMs: 42000,
    });
    assert.strictEqual(result.rank, 1);
    assert.ok(store.list().length > 0, 'list should be non-empty after submit');

    await store.reset();
    assert.deepStrictEqual(store.list(), []);
  });

  it('reset command clears high scores when confirmed', async () => {
    const extension = vscode.extensions.getExtension<BrainrotRunnersApi>(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} should be installed`);
    const { store } = await extension.activate();

    await store.submit({ score: 999, coins: 1, distance: 10, durationMs: 1000 });
    assert.ok(store.list().length > 0, 'list should be non-empty before reset');

    // skipConfirm bypasses the modal, which cannot be clicked in tests.
    await vscode.commands.executeCommand('brainrotRunners.resetHighScores', { skipConfirm: true });
    assert.deepStrictEqual(store.list(), []);
  });
});
