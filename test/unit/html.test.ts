import { describe, expect, it } from 'vitest';
import { buildHtml, getNonce } from '../../src/html';

const OPTIONS = {
  nonce: 'abc123',
  scriptUri: 'vscode-resource://dist/webview.js',
  styleUri: 'vscode-resource://media/styles.css',
  cspSource: 'vscode-resource:',
};

describe('buildHtml', () => {
  it('uses the nonce for the CSP and the script tag', () => {
    const html = buildHtml(OPTIONS);
    expect(html).toContain("script-src 'nonce-abc123'");
    expect(html).toContain('<script nonce="abc123" src="vscode-resource://dist/webview.js">');
  });

  it('restricts everything else to the webview origin', () => {
    const html = buildHtml(OPTIONS);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('style-src vscode-resource:');
    expect(html).toContain('img-src vscode-resource: data:');
  });

  it('links the stylesheet and provides the canvas and ui roots', () => {
    const html = buildHtml(OPTIONS);
    expect(html).toContain('href="vscode-resource://media/styles.css"');
    expect(html).toContain('<canvas id="game">');
    expect(html).toContain('<div id="ui">');
  });
});

describe('getNonce', () => {
  it('returns 32 alphanumeric characters that differ between calls', () => {
    const a = getNonce();
    expect(a).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(getNonce()).not.toBe(a);
  });
});
