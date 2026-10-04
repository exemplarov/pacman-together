/** Direction model shared by engine, renderer, input (003) and API payloads (004). */

/** Index order = classic ghost tie-break priority (up > left > down > right). */
export const DIRECTIONS = ["up", "left", "down", "right"] as const;
export type Direction = (typeof DIRECTIONS)[number];
export type DirIndex = 0 | 1 | 2 | 3;

export const DIR_VEC: readonly { dx: number; dy: number }[] = [
  { dx: 0, dy: -1 }, // up
  { dx: -1, dy: 0 }, // left
  { dx: 0, dy: 1 }, // down
  { dx: 1, dy: 0 }, // right
];

export const OPPOSITE: readonly DirIndex[] = [2, 3, 0, 1];

export function dirIndex(d: Direction): DirIndex {
  return DIRECTIONS.indexOf(d) as DirIndex;
}

export function dirName(i: DirIndex): Direction {
  return DIRECTIONS[i];
}
