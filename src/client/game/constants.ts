/** Classic Pacman constants — values from the Pac-Man Dossier (see specs/002). */

export const TILE = 8;
export const COLS = 28;
export const ROWS = 31;
export const W = COLS * TILE; // 224
export const H = ROWS * TILE; // 248

export const TICKS_PER_SEC = 60;
/** Max arcade speed: 75.75757 px/s → px per 60Hz tick. */
export const BASE_PX_PER_TICK = 75.75757 / TICKS_PER_SEC;

/** Speeds as % of BASE_PX_PER_TICK, per level class (L1 / L2-4 / L5+). */
export interface SpeedTable {
  pac: number;
  pacFright: number;
  ghost: number;
  ghostFright: number;
  tunnel: number;
}

export const SPEED_TABLES: readonly SpeedTable[] = [
  { pac: 80, pacFright: 90, ghost: 75, ghostFright: 50, tunnel: 40 },
  { pac: 90, pacFright: 95, ghost: 85, ghostFright: 55, tunnel: 45 },
  { pac: 100, pacFright: 100, ghost: 95, ghostFright: 60, tunnel: 50 },
];

/** Ghost eyes return speed (% of base). */
export const EYES_SPEED = 150;
/** Ghost house (bob/leave/enter) speed (% of base). */
export const HOUSE_SPEED = 40;

/** Frightened duration in seconds per level (dossier table); beyond table → 0. */
export const FRIGHT_SECONDS: readonly number[] = [
  6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1, 0, 0,
];
/** Frightened flashing window (seconds before end). */
export const FRIGHT_FLASH_SEC = 2;

/** Scatter/chase phases in seconds; Infinity = permanent chase. */
export interface Phase {
  mode: "scatter" | "chase";
  seconds: number;
}

const SCATTER_L1: readonly Phase[] = [
  { mode: "scatter", seconds: 7 },
  { mode: "chase", seconds: 20 },
  { mode: "scatter", seconds: 7 },
  { mode: "chase", seconds: 20 },
  { mode: "scatter", seconds: 5 },
  { mode: "chase", seconds: 20 },
  { mode: "scatter", seconds: 5 },
  { mode: "chase", seconds: Infinity },
];

const SCATTER_L2_4: readonly Phase[] = [
  { mode: "scatter", seconds: 7 },
  { mode: "chase", seconds: 20 },
  { mode: "scatter", seconds: 7 },
  { mode: "chase", seconds: 20 },
  { mode: "scatter", seconds: 5 },
  { mode: "chase", seconds: 1033 },
  { mode: "scatter", seconds: 1 / 60 },
  { mode: "chase", seconds: Infinity },
];

const SCATTER_L5P: readonly Phase[] = [
  { mode: "scatter", seconds: 5 },
  { mode: "chase", seconds: 20 },
  { mode: "scatter", seconds: 5 },
  { mode: "chase", seconds: 20 },
  { mode: "scatter", seconds: 5 },
  { mode: "chase", seconds: 1037 },
  { mode: "scatter", seconds: 1 / 60 },
  { mode: "chase", seconds: Infinity },
];

export function scatterSchedule(level: number): readonly Phase[] {
  if (level <= 1) return SCATTER_L1;
  if (level <= 4) return SCATTER_L2_4;
  return SCATTER_L5P;
}

export function speedTable(level: number): SpeedTable {
  if (level <= 1) return SPEED_TABLES[0]!;
  if (level <= 4) return SPEED_TABLES[1]!;
  return SPEED_TABLES[2]!;
}

/** Cruise Elroy dot thresholds (dots remaining) per level — simplified ramp. */
export function elroyThresholds(level: number): { e1: number; e2: number } {
  const e1 = Math.min(20 + (level - 1) * 10, 60);
  return { e1, e2: Math.floor(e1 / 2) };
}

/** Frightened seconds for a level (0 when past table). */
export function frightSeconds(level: number): number {
  return level <= FRIGHT_SECONDS.length ? FRIGHT_SECONDS[level - 1]! : 0;
}

export interface FruitSpec {
  name: string;
  points: number;
  color: string;
  color2: string;
}

export const FRUITS: readonly FruitSpec[] = [
  { name: "cherry", points: 100, color: "#ff2e4d", color2: "#00b35c" },
  { name: "strawberry", points: 300, color: "#ff4d6d", color2: "#7dff6d" },
  { name: "orange", points: 500, color: "#ffa63d", color2: "#7dff6d" },
  { name: "orange", points: 500, color: "#ffa63d", color2: "#7dff6d" },
  { name: "apple", points: 700, color: "#ff2e2e", color2: "#7dff6d" },
  { name: "apple", points: 700, color: "#ff2e2e", color2: "#7dff6d" },
  { name: "melon", points: 1000, color: "#7dff6d", color2: "#123c1b" },
  { name: "melon", points: 1000, color: "#7dff6d", color2: "#123c1b" },
  { name: "galaxian", points: 2000, color: "#4dc9ff", color2: "#ffd700" },
  { name: "galaxian", points: 2000, color: "#4dc9ff", color2: "#ffd700" },
  { name: "bell", points: 3000, color: "#ffe98a", color2: "#b8a03e" },
  { name: "bell", points: 3000, color: "#ffe98a", color2: "#b8a03e" },
  { name: "key", points: 5000, color: "#dbe4ff", color2: "#ffd700" },
];

export function fruitForLevel(level: number): FruitSpec {
  const i = Math.min(level, FRUITS.length) - 1;
  return FRUITS[i]!;
}

/** Fruit appears after this many dots eaten (twice per level). */
export const FRUIT_DOT_TRIGGERS: readonly number[] = [70, 170];
export const FRUIT_TICKS = Math.round(9.5 * TICKS_PER_SEC);

export const SCORE_DOT = 10;
export const SCORE_ENERGIZER = 50;
export const SCORE_GHOST_CHAIN: readonly number[] = [200, 400, 800, 1600];
export const EXTRA_LIFE_AT = 10_000;

export const START_LIVES = 3;

/** Pixel positions (actor centers). */
export const PAC_START = { x: 14 * TILE, y: 23 * TILE + 4 }; // x=112 boundary of tiles 13/14
export const BLINKY_START = { x: 14 * TILE, y: 11 * TILE + 4 }; // above door
export const HOUSE_CENTER = { x: 14 * TILE, y: 14 * TILE + 4 }; // inside house
export const HOUSE_INKY_X = 12 * TILE;
export const HOUSE_CLYDE_X = 16 * TILE;
export const DOOR_Y = 11 * TILE + 4; // row 11 center — target for eyes & leaving end
export const FRUIT_POS = { x: 14 * TILE, y: 17 * TILE + 4 };

/** Red zones: ghosts (not frightened/eyes) may not choose UP here. */
export const RED_ZONES: readonly { y: number; x0: number; x1: number }[] = [
  { y: 11, x0: 12, x1: 15 },
  { y: 23, x0: 12, x1: 15 },
];

/** Tunnel slowdown zone: row 14 outside x∈[6,21]. */
export function inTunnelZone(tileX: number, tileY: number): boolean {
  return tileY === 14 && (tileX < 6 || tileX > 21);
}

/** Ghost house exit rules (simplified per D9): dot limits + timer fallbacks. */
export function houseExitRules(level: number): {
  pinky: { dots: number; ticks: number };
  inky: { dots: number; ticks: number };
  clyde: { dots: number; ticks: number };
} {
  const k = level - 1;
  return {
    pinky: { dots: Number.POSITIVE_INFINITY, ticks: 2 * TICKS_PER_SEC },
    inky: { dots: Math.max(0, 30 - 10 * k), ticks: 6 * TICKS_PER_SEC },
    clyde: { dots: Math.max(0, 60 - 15 * k), ticks: 10 * TICKS_PER_SEC },
  };
}

/** Durations of non-playing states in ticks. */
export const READY_TICKS = 130;
export const DEATH_FREEZE_TICKS = 30;
export const DEATH_ANIM_TICKS = 110;
export const DEATH_PAUSE_TICKS = 20;
export const EAT_GHOST_FREEZE_TICKS = 40;
export const LEVEL_CLEAR_TICKS = 150;

/** Pacman cornering tolerance: max px off tile-center to still turn (per axis). */
export const CORNER_TOLERANCE = 4;

/** Neon palette (D1). */
export const COLORS = {
  pac: "#ffd83d",
  dot: "#ffe3b3",
  door: "#ffb3d9",
  ghost: {
    blinky: "#ff3b4e",
    pinky: "#ff9ddb",
    inky: "#4de1ff",
    clyde: "#ffb14d",
  },
  frightBody: "#2130d8",
  frightFace: "#f7c8a0",
  frightFlash: "#f4f6ff",
  eyes: "#dff3ff",
  ready: "#ffd83d",
  gameOver: "#ff3b4e",
  popup: "#7dffef",
} as const;
