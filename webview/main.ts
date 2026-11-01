import type { HostToWebview, WebviewToHost } from '../src/messages';
import { GameController } from './controller';
import { createAudio } from './audio';
import { attachInput } from './input';
import { render } from './render/renderer';
import { Ui, type UiHandlers } from './ui';

const vscode = acquireVsCodeApi();

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;
const muteButton = document.getElementById('mute') as HTMLButtonElement;
const ctx = canvas.getContext('2d');

/** Canvas size in CSS pixels plus the device pixel ratio, kept in step with the panel. */
const view = { width: 0, height: 0, dpr: 1 };

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  view.width = width;
  view.height = height;
  view.dpr = dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
}

resize();
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(resize).observe(document.documentElement);
} else {
  window.addEventListener('resize', resize);
}

// The UI keeps a reference to this object and calls it on click, so the handlers can be filled
// in once the controller exists.
const uiHandlers = {} as UiHandlers;
const ui = new Ui(uiRoot, uiHandlers);

const controller = new GameController({
  ui,
  sfx: createAudio(true),
  post: (msg: WebviewToHost) => vscode.postMessage(msg),
  now: () => performance.now(),
  seed: () => Math.floor(Math.random() * 0x7fffffff),
  setReducedMotion: (on) => document.body.classList.toggle('reduced-motion', on),
  onSoundChanged: (on) => {
    muteButton.textContent = on ? '🔊' : '🔇';
    muteButton.setAttribute('aria-pressed', String(!on));
    muteButton.setAttribute('aria-label', on ? 'Mute sound' : 'Unmute sound');
  },
});
Object.assign(uiHandlers, controller.uiHandlers());

muteButton.addEventListener('click', () => {
  controller.toggleSound();
  // Drop focus so Space goes back to jumping instead of re-activating the button.
  muteButton.blur();
});

window.addEventListener('message', (event: MessageEvent<HostToWebview>) => {
  controller.handleHostMessage(event.data);
});

attachInput(window, {
  onAction: (a) => controller.onAction(a),
  onCommand: (c) => controller.onCommand(c),
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    controller.onVisibilityHidden();
  }
});
window.addEventListener('blur', () => controller.onVisibilityHidden());

let lastFrame: number | undefined;
function frame(timestamp: number): void {
  const dt = lastFrame === undefined ? 0 : (timestamp - lastFrame) / 1000;
  lastFrame = timestamp;
  controller.tick(dt);

  if (ctx) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    render(ctx, controller.state, {
      width: view.width,
      height: view.height,
      dpr: view.dpr,
      reducedMotion: controller.settings.reducedMotion,
      best: controller.best,
      realTime: timestamp / 1000,
    });
  }
  requestAnimationFrame(frame);
}

controller.start();
requestAnimationFrame(frame);

const ready: WebviewToHost = { type: 'ready' };
vscode.postMessage(ready);
