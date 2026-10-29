import * as vscode from 'vscode';
import { GameSession } from './GameSession';
import { VIEW_TYPE } from './messages';
import { HighScoreStore } from './highScores';

/** The game in an editor tab. */
export class GamePanel {
  /** The single open game panel, if any. Exposed for tests. */
  public static currentPanel: GamePanel | undefined;

  private readonly session: GameSession;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    store: HighScoreStore,
    initialView?: 'title' | 'highScores',
  ) {
    this.session = new GameSession(panel.webview, extensionUri, store, initialView);
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  /** Opens the game panel, or reveals it if it is already open. */
  public static createOrShow(
    context: vscode.ExtensionContext,
    store: HighScoreStore,
    view?: 'title' | 'highScores',
  ): GamePanel {
    if (GamePanel.currentPanel) {
      GamePanel.currentPanel.panel.reveal(vscode.ViewColumn.Active);
      if (view) {
        GamePanel.currentPanel.session.sendInit(view);
      }
      return GamePanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      'Brainrot Runners',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist'),
          vscode.Uri.joinPath(context.extensionUri, 'media'),
        ],
      },
    );

    GamePanel.currentPanel = new GamePanel(panel, context.extensionUri, store, view);
    return GamePanel.currentPanel;
  }

  /** Re-sends the current high score list to the open panel (e.g. after a reset). */
  public notifyScoresChanged(): void {
    this.session.notifyScoresChanged();
  }

  public dispose(): void {
    if (GamePanel.currentPanel === this) {
      GamePanel.currentPanel = undefined;
    }
    this.session.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
    this.panel.dispose();
  }
}
