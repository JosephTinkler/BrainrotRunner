import * as vscode from 'vscode';
import { GameSession } from './GameSession';
import { SIDEBAR_VIEW_ID } from './messages';
import { HighScoreStore } from './highScores';

/** The game in the Activity Bar sidebar, so it opens like any other extension view. */
export class GameViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = SIDEBAR_VIEW_ID;

  private session: GameSession | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: HighScoreStore,
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.extensionUri, 'media'),
      ],
    };

    const session = new GameSession(webviewView.webview, this.extensionUri, this.store);
    this.session = session;

    // The view is kept alive while hidden (retainContextWhenHidden is set at registration), so
    // tell the game to pause rather than letting a run carry on unseen.
    webviewView.onDidChangeVisibility(() => {
      if (!webviewView.visible) session.pause();
    });
    webviewView.onDidDispose(() => {
      session.dispose();
      if (this.session === session) this.session = undefined;
    });
  }

  /** Re-sends the current high score list to the sidebar (e.g. after a reset). */
  public notifyScoresChanged(): void {
    this.session?.notifyScoresChanged();
  }
}
