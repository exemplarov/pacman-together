/** Ghost personalities & shared pathfinding — targeting per the Pac-Man Dossier. */
import { RED_ZONES } from "./constants";
import type { Maze } from "./maze";
import { DIR_VEC, OPPOSITE, type DirIndex } from "../../shared/directions";

export type GhostName = "blinky" | "pinky" | "inky" | "clyde";
export type GhostState = "house" | "leaving" | "active" | "eyes" | "entering";

export interface Ghost {
  name: GhostName;
  x: number;
  y: number;
  dir: DirIndex;
  state: GhostState;
  frightened: boolean;
  /** house dwell bookkeeping */
  houseTicks: number;
  exitDots: number; // dots threshold before this ghost may leave
  exitTicks: number; // timer fallback (ticks in house before forced exit)
  elroy: 0 | 1 | 2; // blinky only
  scatterTarget: { x: number; y: number }; // tile coords (may be off-grid)
}

export const SCATTER_TARGETS: Record<GhostName, { x: number; y: number }> = {
  blinky: { x: 25, y: 0 },
  pinky: { x: 2, y: 0 },
  inky: { x: 27, y: 31 },
  clyde: { x: 0, y: 31 },
};

export function tileOf(x: number, y: number): { tx: number; ty: number } {
  return { tx: Math.floor(x / 8), ty: Math.floor(y / 8) };
}

/**
 * Pinky: 4 tiles ahead of Pacman. Replicates the arcade overflow bug:
 * when Pacman faces up, the target is 4 up AND 4 left.
 */
export function pinkyTarget(
  pacTx: number,
  pacTy: number,
  pacDir: DirIndex,
): { x: number; y: number } {
  const v = DIR_VEC[pacDir]!;
  let x = pacTx + v.dx * 4;
  let y = pacTy + v.dy * 4;
  if (pacDir === 0) x -= 4; // up-bug
  return { x, y };
}

/** Inky: pivot = 2 ahead of Pacman (with up-bug); target = pivot + (pivot − blinky). */
export function inkyTarget(
  pacTx: number,
  pacTy: number,
  pacDir: DirIndex,
  blinkyTx: number,
  blinkyTy: number,
): { x: number; y: number } {
  const v = DIR_VEC[pacDir]!;
  let px = pacTx + v.dx * 2;
  let py = pacTy + v.dy * 2;
  if (pacDir === 0) px -= 2; // up-bug
  return { x: px * 2 - blinkyTx, y: py * 2 - blinkyTy };
}

/** Clyde: chases when ≥8 tiles (Euclidean) away, else scatters home. */
export function clydeTarget(
  clydeTx: number,
  clydeTy: number,
  pacTx: number,
  pacTy: number,
): { x: number; y: number } {
  const dist = Math.hypot(pacTx - clydeTx, pacTy - clydeTy);
  return dist >= 8 ? { x: pacTx, y: pacTy } : SCATTER_TARGETS.clyde;
}

export function inRedZone(tx: number, ty: number): boolean {
  return RED_ZONES.some((z) => ty === z.y && tx >= z.x0 && tx <= z.x1);
}

export interface ChooseOptions {
  /** eyes ignore red zones and the no-reverse rule is relaxed only if stuck */
  eyes: boolean;
}

/**
 * Classic decision rule: among passable next tiles excluding reverse, pick the
 * one closest (Euclidean, tile centers) to `target`; ties break up > left >
 * down > right (index order). Returns opposite only when nothing else exists.
 */
export function chooseGhostDirection(
  maze: Maze,
  tx: number,
  ty: number,
  dir: DirIndex,
  target: { x: number; y: number },
  opts: ChooseOptions,
): DirIndex {
  const reverse = OPPOSITE[dir]!;
  let best: DirIndex | undefined;
  let bestDist = Infinity;
  for (let d = 0 as DirIndex; d < 4; d = (d + 1) as DirIndex) {
    if (d === reverse) continue;
    if (!opts.eyes && d === 0 && inRedZone(tx, ty)) continue;
    const v = DIR_VEC[d]!;
    const nx = tx + v.dx;
    const ny = ty + v.dy;
    if (!maze.isPathable(nx, ny)) continue;
    const dist = (nx - target.x) ** 2 + (ny - target.y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  if (best === undefined) {
    const v = DIR_VEC[reverse]!;
    if (maze.isPathable(tx + v.dx, ty + v.dy)) return reverse;
    return dir; // fully boxed in (shouldn't happen)
  }
  return best;
}

/** Frightened ghosts pick a random passable non-reverse direction (or reverse). */
export function chooseFrightenedDirection(
  maze: Maze,
  tx: number,
  ty: number,
  dir: DirIndex,
  rng: () => number = Math.random,
): DirIndex {
  const reverse = OPPOSITE[dir]!;
  const options: DirIndex[] = [];
  for (let d = 0 as DirIndex; d < 4; d = (d + 1) as DirIndex) {
    if (d === reverse) continue;
    const v = DIR_VEC[d]!;
    if (maze.isPathable(tx + v.dx, ty + v.dy)) options.push(d);
  }
  if (options.length === 0) return reverse;
  return options[Math.floor(rng() * options.length)]!;
}
