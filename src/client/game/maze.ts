/**
 * Classic Pacman maze (28×31) — layout verified to contain exactly 240 dots
 * and 4 energizers (see maze.test.ts and the Pac-Man Dossier).
 *
 * Legend: `#` wall · `.` dot · `o` energizer · `-` ghost house door ·
 * `h` house interior · `t` tunnel (walkable, no dot) ·
 * `_` walkable corridor without dot · ` ` dead space (impassable)
 */
export const CLASSIC_MAZE_ROWS: readonly string[] = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.#####_##_#####.######",
  "     #.#####_##_#####.#     ",
  "     #.##__________##.#     ",
  "     #.##_###--###_##.#     ",
  "######.##_#hhhhhh#_##.######",
  "tttttt.___#hhhhhh#___.tttttt",
  "######.##_#hhhhhh#_##.######",
  "     #.##_########_##.#     ",
  "     #.##__________##.#     ",
  "     #.##_########_##.#     ",
  "######.##_########_##.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#.####.#####.##.#####.####.#",
  "#o..##.......__.......##..o#",
  "###.##.##.########.##.##.###",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################",
];

export const enum Tile {
  Wall,
  Dot,
  Energizer,
  Door,
  House,
  Tunnel,
  Empty,
  Dead,
}

export type TileGrid = Tile[][];

function charToTile(c: string): Tile {
  switch (c) {
    case "#":
      return Tile.Wall;
    case ".":
      return Tile.Dot;
    case "o":
      return Tile.Energizer;
    case "-":
      return Tile.Door;
    case "h":
      return Tile.House;
    case "t":
      return Tile.Tunnel;
    case "_":
      return Tile.Empty;
    default:
      return Tile.Dead;
  }
}

export class Maze {
  readonly grid: TileGrid;
  readonly cols: number;
  readonly rows: number;
  private readonly sourceRows: readonly string[];
  private dotsLeft: number;

  constructor(rows: readonly string[]) {
    this.sourceRows = rows;
    this.rows = rows.length;
    this.cols = rows[0]?.length ?? 0;
    this.grid = rows.map((row) => {
      if (row.length !== this.cols) {
        throw new Error(`maze row length mismatch: "${row}"`);
      }
      return [...row].map(charToTile);
    });
    this.dotsLeft = this.countDots();
  }

  static classic(): Maze {
    return new Maze(CLASSIC_MAZE_ROWS);
  }

  clone(): Maze {
    return new Maze(this.sourceRows);
  }

  tileAt(tx: number, ty: number): Tile {
    if (ty < 0 || ty >= this.rows || tx < 0 || tx >= this.cols) return Tile.Dead;
    return this.grid[ty]![tx]!;
  }

  /** Tiles Pacman/ghosts can path through (door & house excluded; OOB tunnel row open). */
  isPathable(tx: number, ty: number): boolean {
    if (ty === 14 && (tx < 0 || tx >= this.cols)) return true; // tunnel wrap corridor
    const t = this.tileAt(tx, ty);
    return t === Tile.Dot || t === Tile.Energizer || t === Tile.Tunnel || t === Tile.Empty;
  }

  /** Eats the dot/energizer at a tile; returns what was eaten or null. */
  eat(tx: number, ty: number): Tile.Dot | Tile.Energizer | null {
    const t = this.tileAt(tx, ty);
    if (t !== Tile.Dot && t !== Tile.Energizer) return null;
    this.grid[ty]![tx] = Tile.Empty;
    this.dotsLeft--;
    return t;
  }

  get remainingDots(): number {
    return this.dotsLeft;
  }

  countDots(): number {
    let n = 0;
    for (const row of this.grid) {
      for (const t of row) {
        if (t === Tile.Dot || t === Tile.Energizer) n++;
      }
    }
    return n;
  }

  countEnergizers(): number {
    let n = 0;
    for (const row of this.grid) {
      for (const t of row) if (t === Tile.Energizer) n++;
    }
    return n;
  }

  reset(): void {
    for (let y = 0; y < this.rows; y++) {
      const src = this.sourceRows[y]!;
      for (let x = 0; x < this.cols; x++) {
        this.grid[y]![x] = charToTile(src[x]!);
      }
    }
    this.dotsLeft = this.countDots();
  }
}
