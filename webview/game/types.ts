export type Lane = -1 | 0 | 1;

// low = Doomscroll Fence (jump over), high = Ratio Banner (slide under),
// block = Parked Train (lane change only), moving = Sigma Express (oncoming train)
export type ObstacleKind = 'low' | 'high' | 'block' | 'moving';

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  lane: Lane;
  z: number; // centre position along the track (player is at z = 0)
  depth: number;
}

export interface Coin {
  id: number;
  lane: Lane;
  z: number;
  y: number;
  collected: boolean;
}

export interface PlayerState {
  lane: Lane; // committed target lane
  fromLane: Lane; // lane the current tween started from
  laneT: number; // 0..1 tween progress
  y: number; // height above ground
  jumpT: number; // seconds into jump, -1 if grounded
  slideT: number; // seconds into slide, -1 if not sliding
}

export type InputAction = 'left' | 'right' | 'jump' | 'slide';

export type Phase = 'title' | 'running' | 'paused' | 'crashed' | 'gameover';

export interface GameState {
  phase: Phase;
  time: number;
  distance: number;
  speed: number;
  coins: number;
  score: number;
  multiplier: number;
  player: PlayerState;
  obstacles: Obstacle[];
  coinsList: Coin[];
  nextRowZ: number; // distance at which the next row spawns
  nextId: number;
  seed: number;
  rngState: number;
  bufferedAction: { action: InputAction; age: number } | null;
  crashT: number;
  distanceScore: number; // sum of speed * dt * multiplier; score = floor(distanceScore) + coins * COIN_VALUE
}
