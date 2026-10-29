import * as vscode from 'vscode';
import { GamePanel } from './GamePanel';
import { HighScoreStore } from './highScores';

export interface BrainrotRunnersApi {
  store: HighScoreStore;
}

export function activate(context: vscode.ExtensionContext): BrainrotRunnersApi {
  const store = new HighScoreStore(context.globalState);

  context.subscriptions.push(
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
        void vscode.window.showInformationMessage('Brainrot Runners high scores reset.');
      },
    ),
  );

  return { store };
}

export function deactivate(): void {
  GamePanel.currentPanel?.dispose();
}
