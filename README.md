# Brainrot Runners

Brainrot Runners is an original endless 3-lane runner that plays right inside VS Code, in its own Activity Bar sidebar or in an editor tab. Dodge fences, banners and carts, collect brain cells, and keep going while the game gets faster the longer you survive. Your best runs are saved locally as high scores.

> Screenshot coming soon

## How to play

Click the **Brainrot Runners** icon in the Activity Bar to open the game in the sidebar, like any other extension. Use the button at the top of the view to pop it out into an editor tab, or drag the view to the bottom panel or secondary sidebar if you want more room.

You can also open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run one of these commands:

- **Brainrot Runners: Play** opens the game in an editor tab.
- **Brainrot Runners: Show High Scores** opens the game on the high-score screen.
- **Brainrot Runners: Reset High Scores** clears your saved scores (after a confirmation).

## Controls

| Action | Keyboard | Mouse / trackpad |
|---|---|---|
| Change lane | ← / → or A / D | Drag left / right |
| Jump | ↑ / W / Space | Drag up |
| Slide (fast-fall in the air) | ↓ / S | Drag down |
| Pause | P / Esc | - |
| Restart | R / Enter | Click "Run again" |

## Obstacles

- **Doomscroll Fence**: jump over it.
- **Ratio Banner**: slide under it.
- **Brick of Cringe**: change lane to avoid it.
- **Sigma Cart**: fast-moving; change lane to avoid it.

## Scoring

Your score is the distance you travel multiplied by a multiplier, plus 10 points for every brain cell you collect. The multiplier rises by 1 every 30 seconds you survive, up to a maximum of x5.

## Settings

- `brainrotRunners.sound` (default `true`): play simple sound effects.
- `brainrotRunners.reducedMotion` (default `false`): reduce screen shake and flashing effects.

## Privacy

High scores are stored locally in VS Code's `globalState` on your machine. They are not synced across devices and the extension makes no network requests.

## Development

```sh
npm install          # install dependencies
npm run build        # bundle the extension and webview into dist/
npm run watch        # rebuild on change
# Press F5 in VS Code to launch the Extension Development Host
npm run lint         # ESLint
npm test             # unit and integration tests
npm run package      # build a .vsix with vsce
```

## License

MIT. See [LICENSE](LICENSE).
