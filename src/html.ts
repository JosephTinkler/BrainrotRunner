/** Builds the webview HTML. Kept free of the `vscode` module so it can be unit tested. */

export interface HtmlOptions {
  nonce: string;
  scriptUri: string;
  styleUri: string;
  cspSource: string;
}

export function buildHtml({ nonce, scriptUri, styleUri, cspSource }: HtmlOptions): string {
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src ${cspSource}`,
    `img-src ${cspSource} data:`,
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

export function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
