import * as vscode from 'vscode';
import { buildHtml, getNonce } from './html';
import { HighScoreStore } from './highScores';
import { HostToWebview, Settings, WebviewToHost } from './messages';

/**
 * Wires one webview (an editor tab or the sidebar view) to the game: loads the page and routes
 * messages between the webview and the high-score store.
 */
export class GameSession {
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly webview: vscode.Webview,
    extensionUri: vscode.Uri,
    private readonly store: HighScoreStore,
    private readonly initialView?: 'title' | 'highScores',
  ) {
    this.webview.html = buildHtml({
      nonce: getNonce(),
      scriptUri: webview
        .asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'))
        .toString(),
      styleUri: webview
        .asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'styles.css'))
        .toString(),
      cspSource: webview.cspSource,
    });

    this.webview.onDidReceiveMessage(
      (message: WebviewToHost) => this.handleMessage(message),
      undefined,
      this.disposables,
    );
  }

  /** Re-initialises the webview, optionally jumping to a screen. */
  public sendInit(view?: 'title' | 'highScores'): void {
    this.post({
      type: 'init',
      highScores: this.store.list(),
      settings: readSettings(),
      view,
    });
  }

  /** Re-sends the current high score list (e.g. after a reset). */
  public notifyScoresChanged(): void {
    this.post({ type: 'highScores', list: this.store.list() });
  }

  /** Pauses a run in progress, e.g. when the webview is hidden. */
  public pause(): void {
    this.post({ type: 'pause' });
  }

  public dispose(): void {
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  private post(message: HostToWebview): void {
    void this.webview.postMessage(message);
  }

  private handleMessage(message: WebviewToHost): void {
    switch (message.type) {
      case 'ready':
        this.sendInit(this.initialView);
        break;
      case 'gameOver': {
        if (
          typeof message.score !== 'number' ||
          typeof message.coins !== 'number' ||
          typeof message.distance !== 'number' ||
          typeof message.durationMs !== 'number'
        ) {
          break;
        }
        const { score, coins, distance, durationMs } = message;
        void this.store.submit({ score, coins, distance, durationMs }).then(({ list, rank }) => {
          this.post({ type: 'highScores', list, newRank: rank ?? undefined });
        });
        break;
      }
      case 'requestHighScores':
        this.post({ type: 'highScores', list: this.store.list() });
        break;
    }
  }
}

function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration('brainrotRunners');
  return {
    sound: config.get<boolean>('sound', true),
    reducedMotion: config.get<boolean>('reducedMotion', false),
  };
}
