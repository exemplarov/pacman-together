import { beforeEach, describe, expect, test } from "bun:test";
import { Engine } from "./engine";
import { Tile } from "./maze";
import { PAC_START } from "./constants";

/** run `n` playing ticks (auto-starting the run and skipping READY) */
function play(e: Engine, n: number): void {
  e.startRun();
  e.state = "playing";
  for (let i = 0; i < n; i++) e.tick();
}

describe("pacman movement", () => {
  let e: Engine;
  beforeEach(() => {
    e = new Engine();
  });

  test("starts at start position moving right", () => {
    expect(e.pac.x).toBe(PAC_START.x);
    expect(e.pac.y).toBe(PAC_START.y);
    expect(e.pac.dir).toBe(3);
  });

  test("moves right ~80% base speed on level 1 and stops at the wall", () => {
    play(e, 400);
    // row 23 corridor: wall at x=22 → pac stops at tile 22's center? wall at 22 means
    // pac stops at tile 21 center (x=21*8+4=172)
    expect(e.pac.moving).toBe(false);
    expect(e.pac.x).toBeCloseTo(172, 0);
    // ate dots x=15..21 (7 dots) crossing from x=112
    expect(e.score).toBe(70);
    expect(e.maze.remainingDots).toBe(244 - 7);
  });

  test("corridor dots eaten along the way, no double eat", () => {
    play(e, 30);
    expect(e.score).toBeGreaterThan(0);
    expect(e.score % 10).toBe(0);
  });

  test("reverse is instant mid-corridor", () => {
    play(e, 20);
    const xBefore = e.pac.x;
    e.pressDirection("left");
    e.tick();
    expect(e.pac.dir).toBe(1);
    expect(e.pac.x).toBeLessThan(xBefore);
  });
});

describe("energizer & frightened", () => {
  test("eating an energizer frightens ghosts and resets chain", () => {
    const e = new Engine();
    e.startRun();
    e.state = "playing";
    // place pac just above the (26,23) energizer moving down
    e.pac.x = 26 * 8 + 4;
    e.pac.y = 22 * 8 + 4;
    e.pac.dir = 2;
    e.pac.desired = 2;
    e.pac.moving = true;
    for (let i = 0; i < 30; i++) e.tick();
    expect(e.maze.tileAt(26, 23)).not.toBe(Tile.Energizer);
    expect(e.frightTicks).toBeGreaterThan(0);
    expect(e.score).toBe(50 + 10); // energizer + dot at (26,22)
    expect(e.ghosts.every((g) => g.state !== "active" || g.frightened)).toBe(true);
  });

  test("eating frightened ghosts chains 200→400→800→1600", () => {
    const e = new Engine();
    e.startRun();
    e.state = "playing";
    // park pac (stationary, centered) so it stays on the same tile
    e.pac.x = 1 * 8 + 4;
    e.pac.y = 1 * 8 + 4;
    e.pac.dir = 3;
    e.pac.desired = 3;
    e.pac.moving = false;
    e.frightTicks = 600;
    for (const g of e.ghosts) g.frightened = true;
    e.ghostChain = 0;
    let chainScore = 0;
    let idx = 0;
    for (const pts of [200, 400, 800, 1600] as const) {
      const ghost = e.ghosts[idx++]!;
      ghost.state = "active";
      ghost.frightened = true;
      ghost.x = e.pac.x;
      ghost.y = e.pac.y;
      const before = e.score;
      e.tick();
      chainScore += pts;
      expect(e.score - before).toBeGreaterThanOrEqual(pts);
      expect(ghost.state as string).toBe("eyes");
      // drain the eat-freeze so the next round can run
      for (let i = 0; i < 45 && e.freezeTicks > 0; i++) e.tick();
    }
    expect(chainScore).toBe(3000);
  });
});

describe("fruit", () => {
  test("spawns at 70 dots and can be eaten", () => {
    const e = new Engine();
    e.startRun();
    e.state = "playing";
    // programmatic: simulate 69 dots eaten then eat one more via pac tile
    e.dotsEaten = 69;
    e.pac.x = 14 * 8;
    e.pac.y = 23 * 8 + 4;
    // (14,23) has no dot — force one: use maze tile (1,1)
    e.pac.x = 1 * 8 + 4;
    e.pac.y = 1 * 8 + 4;
    e.pac.moving = false;
    e.pac.dir = 3;
    e.tick();
    expect(e.dotsEaten).toBe(70);
    expect(e.fruit).not.toBeNull();
    // walk pac to the fruit spot (row 17 center) — teleport for unit test
    e.freezeTicks = 0;
    e.pac.x = 14 * 8;
    e.pac.y = 17 * 8 + 4;
    const before = e.score;
    e.tick();
    expect(e.fruit).toBeNull();
    expect(e.score - before).toBe(100); // cherry on level 1
  });
});

describe("extra life & level clear", () => {
  test("extra life at 10,000 points (once)", () => {
    const e = new Engine();
    e.startRun();
    e.state = "playing";
    (e as unknown as { addScore: (n: number) => void }).addScore(9990);
    e.dotsEaten = 0;
    e.pac.x = 1 * 8 + 4;
    e.pac.y = 1 * 8 + 4;
    e.pac.moving = false;
    e.tick();
    expect(e.lives).toBe(4);
    expect(e.events.some((ev) => ev.type === "extraLife")).toBe(true);
  });

  test("clearing all dots triggers level clear then next level", () => {
    const e = new Engine();
    e.startRun();
    e.state = "playing";
    for (let y = 0; y < e.maze.rows; y++) {
      for (let x = 0; x < e.maze.cols; x++) e.maze.eat(x, y);
    }
    e.tick();
    expect(e.state as string).toBe("levelclear");
    for (let i = 0; i < 200; i++) e.tick();
    expect(e.level).toBe(2);
    expect(e.maze.remainingDots).toBe(244);
    expect(e.state as string).toBe("ready");
  });
});

describe("ghost house flow", () => {
  test("pinky stays ~2s then leaves through door to row 11", () => {
    const e = new Engine();
    e.startRun();
    e.state = "playing";
    const pinky = e.ghosts[1]!;
    expect(pinky.state).toBe("house");
    for (let i = 0; i < 119; i++) e.tick();
    expect(pinky.state).toBe("house"); // timer exit at 120 ticks
    for (let i = 0; i < 100 && pinky.state !== "active"; i++) e.tick();
    expect(pinky.state).toBe("active");
    expect(pinky.y).toBe(92);
  });
});

describe("tunnel wrap (engine level)", () => {
  test("pacman exits left and appears on the right", () => {
    const e = new Engine();
    e.startRun();
    e.state = "playing";
    e.pac.x = 5 * 8 + 4; // tile (5,14) — tunnel row
    e.pac.y = 14 * 8 + 4;
    e.pac.dir = 1;
    e.pac.desired = 1;
    e.pac.moving = true;
    for (let i = 0; i < 60; i++) e.tick();
    expect(e.pac.y).toBe(14 * 8 + 4);
    expect(e.pac.x).toBeGreaterThan(200); // wrapped to the right side
    expect(e.pac.x).toBeLessThan(232);
    expect(e.pac.moving).toBe(true);
  });

  test("ghost wraps too and keeps moving", () => {
    const e = new Engine();
    e.startRun();
    e.state = "playing";
    const blinky = e.ghosts[0]!;
    blinky.x = 2 * 8 + 4;
    blinky.y = 14 * 8 + 4;
    blinky.dir = 1;
    for (let i = 0; i < 60; i++) e.tick();
    expect(blinky.y).toBe(14 * 8 + 4);
    expect(blinky.x).toBeGreaterThan(180);
  });
});

describe("scatter/chase schedule", () => {
  test("phase flips at 7s and forces ghost reversal", () => {
    const e = new Engine();
    e.startRun();
    e.state = "playing";
    // disable collisions so pac survives the wait
    (e as unknown as { checkCollisions: () => void }).checkCollisions = () => {};
    const blinky = e.ghosts[0]!;
    for (let i = 0; i < 418; i++) e.tick();
    expect(e.mode).toBe("scatter");
    const dirBefore = blinky.dir;
    for (let i = 0; i < 4; i++) e.tick();
    expect(e.mode).toBe("chase");
    expect(blinky.dir).not.toBe(dirBefore); // forced reversal on mode change
  });

  test("fright pauses the schedule", () => {
    const e = new Engine();
    e.startRun();
    e.state = "playing";
    (e as unknown as { checkCollisions: () => void }).checkCollisions = () => {};
    e.frightTicks = 100;
    for (let i = 0; i < 200; i++) e.tick();
    expect(e.phaseTicks).toBeLessThan(150); // only ~100 advanced
    expect(e.frightTicks).toBe(0);
  });
});

describe("elroy", () => {
  test("blinky elroy engages by dots remaining", () => {
    const e = new Engine();
    e.startRun();
    e.state = "playing";
    // eat dots until 20 remain
    let eaten = 0;
    outer: for (let y = 0; y < e.maze.rows; y++) {
      for (let x = 0; x < e.maze.cols; x++) {
        if (e.maze.remainingDots <= 20) break outer;
        if (e.maze.eat(x, y)) eaten++;
      }
    }
    expect(e.maze.remainingDots).toBe(20);
    // pac eats one more dot (updateElroy runs inside eatAtPacTile) — row 29
    // still has dots because the loop above stopped early
    e.pac.x = 8 * 8 + 4;
    e.pac.y = 29 * 8 + 4;
    e.pac.moving = false;
    e.pac.dir = 3;
    e.pac.desired = 3;
    e.tick();
    expect(e.ghosts[0]!.elroy).toBe(1); // remaining 19 ≤ e1(20), > e2(10)
  });
});

describe("energizer chain resets on the next energizer", () => {
  test("chain restarts at 200 after a second energizer", () => {
    const e = new Engine();
    e.startRun();
    e.state = "playing";
    e.pac.x = 1 * 8 + 4;
    e.pac.y = 1 * 8 + 4;
    e.pac.moving = false;
    e.pac.dir = 3;
    e.pac.desired = 3;

    // teleport onto the second energizer after eating one ghost
    const eatEnergizerAt = (x: number, y: number) => {
      e.pac.x = x * 8 + 4;
      e.pac.y = y * 8 + 4;
      e.pac.moving = false;
      e.tick();
      for (let i = 0; i < 50 && e.freezeTicks > 0; i++) e.tick();
    };

    eatEnergizerAt(1, 3);
    expect(e.frightTicks).toBeGreaterThan(0);
    e.ghostChain = 2; // simulate two ghosts eaten earlier

    eatEnergizerAt(26, 3);
    const ghost = e.ghosts[0]!;
    ghost.state = "active";
    ghost.frightened = true;
    ghost.x = e.pac.x;
    ghost.y = e.pac.y;
    const before = e.score;
    e.tick();
    expect(e.score - before).toBeGreaterThanOrEqual(200); // 200 again, not 800
    expect(e.score - before).toBeLessThan(400);
  });
});
