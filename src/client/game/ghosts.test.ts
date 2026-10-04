import { describe, expect, test } from "bun:test";
import { Maze } from "./maze";
import {
  chooseGhostDirection,
  clydeTarget,
  inkyTarget,
  pinkyTarget,
} from "./ghosts";
import type { DirIndex } from "../../shared/directions";

describe("pinkyTarget", () => {
  test("4 ahead when facing right", () => {
    expect(pinkyTarget(13, 23, 3)).toEqual({ x: 17, y: 23 });
  });
  test("4 ahead when facing down", () => {
    expect(pinkyTarget(10, 10, 2)).toEqual({ x: 10, y: 14 });
  });
  test("up includes the arcade overflow bug (4 up + 4 left)", () => {
    expect(pinkyTarget(10, 10, 0)).toEqual({ x: 6, y: 6 });
  });
});

describe("inkyTarget", () => {
  test("doubles the vector from blinky to pivot (facing right)", () => {
    // pac (10,10) right → pivot (12,10); blinky (5,8) → target (19,12)
    expect(inkyTarget(10, 10, 3, 5, 8)).toEqual({ x: 19, y: 12 });
  });
  test("up-bug shifts pivot left", () => {
    // pac (10,10) up → pivot (8,8); blinky (0,0) → target (16,16)
    expect(inkyTarget(10, 10, 0, 0, 0)).toEqual({ x: 16, y: 16 });
  });
});

describe("clydeTarget", () => {
  test("far away → chase pacman", () => {
    expect(clydeTarget(0, 0, 10, 10)).toEqual({ x: 10, y: 10 });
  });
  test("within 8 tiles → scatter corner", () => {
    expect(clydeTarget(5, 5, 10, 10)).toEqual({ x: 0, y: 31 });
  });
});

describe("chooseGhostDirection", () => {
  const maze = Maze.classic();

  test("prefers the tile closest to target with up>left>down>right ties", () => {
    // In the row-1 corridor: moving LEFT at (6,1), target further left (1,1).
    // Options at (6,1): up blocked, down (6,2) passable but farther, left closest.
    // (right is the reverse — excluded.)
    const d = chooseGhostDirection(maze, 6, 1, 1, { x: 1, y: 1 }, { eyes: false });
    expect(d).toBe(1); // left
  });

  test("reverses only when boxed in (dead end)", () => {
    // custom mini-maze with a dead-end corridor
    const deadEnd = new Maze([
      "#####",
      "#...#",
      "#####",
    ]);
    // at (3,1) moving right: up/down/right blocked → forced reverse (left)
    const d = chooseGhostDirection(deadEnd, 3, 1, 3, { x: 4, y: 1 }, { eyes: false });
    expect(d).toBe(1);
  });

  test("red zone forbids up for normal ghosts but not eyes", () => {
    // (13,11) is in red zone row 11 and has an opening upward at (13,9..10)? no:
    // (13,10) is '#' in classic — use (12,11): up (12,10) is '_' walkable.
    // Moving right (3) at (12,11), target above (12,0): normal ghost may not go up.
    const normal = chooseGhostDirection(maze, 12, 11, 3, { x: 12, y: 0 }, { eyes: false });
    expect(normal).not.toBe(0);
    const eyes = chooseGhostDirection(maze, 12, 11, 3, { x: 12, y: 0 }, { eyes: true });
    expect(eyes).toBe(0);
  });
});
