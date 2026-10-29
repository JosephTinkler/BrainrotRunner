# Change Log

All notable changes to the "Brainrot Runners" extension are documented in this file.

## [Unreleased]

### Added

- Activity Bar icon and sidebar view, so the game opens without the Command Palette. A run is paused (not lost) when the view is hidden.

## [0.0.1] - 2026-10-29

### Added

- Initial release: an endless 3-lane runner that runs in a VS Code webview panel.
- Commands: **Brainrot Runners: Play**, **Brainrot Runners: Show High Scores**, and **Brainrot Runners: Reset High Scores**.
- Keyboard, mouse, and drag controls for lane changes, jumping, sliding, pausing, and restarting.
- Obstacles: Doomscroll Fence, Ratio Banner, Brick of Cringe, and Sigma Cart.
- Speed increases over time, and the score multiplier rises every 30 seconds up to x5.
- Local high-score table stored in VS Code `globalState`.
- Settings: `brainrotRunners.sound` and `brainrotRunners.reducedMotion`.
