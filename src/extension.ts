import * as vscode from 'vscode';
import { GamePanel } from './GamePanel';
import { GameViewProvider } from './GameViewProvider';
import { HighScoreStore } from './highScores';

export interface BrainrotRunnersApi {
  store: HighScoreStore;
}

export function activate(context: vscode.ExtensionContext): BrainrotRunnersApi {
  const store = new HighScoreStore(context.globalState);

  const viewProvider = new GameViewProvider(context.extensionUri, store);

  context.subscriptions.push(
    // Retained while hidden so switching to another sidebar view does not throw away a run.
    vscode.window.registerWebviewViewProvider(GameViewProvider.viewId, viewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('brainrotRunners.play', () => {
      GamePanel.createOrShow(context, store, 'title');
    }),
    vscode.commands.registerCommand('brainrotRunners.showHighScores', () => {
      GamePanel.createOrShow(context, store, 'highScores');
    }),
    vscode.commands.registerCommand(
      'brainrotRunners.resetHighScores',
      async (options?: { skipConfirm?: boolean }) => {
        // skipConfirm is only passed by the integration tests, since modals cannot be clicked there.
        if (!options?.skipConfirm) {
          const choice = await vscode.window.showWarningMessage(
            'Reset all Brainrot Runners high scores?',
            { modal: true },
            'Reset',
          );
          if (choice !== 'Reset') {
            return;
          }
        }
        await store.reset();
        GamePanel.currentPanel?.notifyScoresChanged();
        viewProvider.notifyScoresChanged();
        void vscode.window.showInformationMessage('Brainrot Runners high scores reset.');
      },
    ),
  );

  return { store };
}

export function deactivate(): void {
  GamePanel.currentPanel?.dispose();
}
