import * as vscode from 'vscode';
import { HostToWebview, Settings, VIEW_TYPE, WebviewToHost } from './messages';
import { HighScoreStore } from './highScores';

export class GamePanel {
  /** The single open game panel, if any. Exposed for tests. */
  public static currentPanel: GamePanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly store: HighScoreStore,
    private readonly initialView?: 'title' | 'highScores',
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (message: WebviewToHost) => this.handleMessage(message),
      undefined,
      this.disposables,
    );

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
        GamePanel.currentPanel.post({
          type: 'init',
          highScores: store.list(),
          settings: readSettings(),
          view,
        });
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
    this.post({ type: 'highScores', list: this.store.list() });
  }

  private post(message: HostToWebview): void {
    void this.panel.webview.postMessage(message);
  }

  private handleMessage(message: WebviewToHost): void {
    switch (message.type) {
      case 'ready':
        this.post({
          type: 'init',
          highScores: this.store.list(),
          settings: readSettings(),
          view: this.initialView,
        });
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

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'styles.css'),
    );
    const csp = [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} data:`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Brainrot Runners</title>
  <link href="${styleUri}" rel="stylesheet">
</head>
<body>
  <canvas id="game"></canvas>
  <div id="ui"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose(): void {
    if (GamePanel.currentPanel === this) {
      GamePanel.currentPanel = undefined;
    }
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
    this.panel.dispose();
  }
}

function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration('brainrotRunners');
  return {
    sound: config.get<boolean>('sound', true),
    reducedMotion: config.get<boolean>('reducedMotion', false),
  };
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
