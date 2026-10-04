import { describe, expect, test } from "bun:test";
import { CLASSIC_MAZE_ROWS, Maze, Tile } from "./maze";

test("classic maze is 28×31", () => {
  expect(CLASSIC_MAZE_ROWS.length).toBe(31);
  for (const row of CLASSIC_MAZE_ROWS) expect(row.length).toBe(28);
});

test("classic maze has exactly 240 dots and 4 energizers", () => {
  const maze = Maze.classic();
  expect(maze.countDots()).toBe(244); // dots + energizers
  expect(maze.countEnergizers()).toBe(4);
  expect(maze.remainingDots).toBe(244);
});

test("energizers sit in the four classic corners", () => {
  const maze = Maze.classic();
  expect(maze.tileAt(1, 3)).toBe(Tile.Energizer);
  expect(maze.tileAt(26, 3)).toBe(Tile.Energizer);
  expect(maze.tileAt(1, 23)).toBe(Tile.Energizer);
  expect(maze.tileAt(26, 23)).toBe(Tile.Energizer);
});

test("ghost house door and geometry", () => {
  const maze = Maze.classic();
  expect(maze.tileAt(13, 12)).toBe(Tile.Door);
  expect(maze.tileAt(14, 12)).toBe(Tile.Door);
  expect(maze.tileAt(13, 14)).toBe(Tile.House); // pinky center
  expect(maze.tileAt(14, 11)).toBe(Tile.Empty); // blinky start row
});

test("tunnel row is pathable and wraps OOB", () => {
  const maze = Maze.classic();
  expect(maze.tileAt(0, 14)).toBe(Tile.Tunnel);
  expect(maze.tileAt(27, 14)).toBe(Tile.Tunnel);
  expect(maze.isPathable(-1, 14)).toBe(true);
  expect(maze.isPathable(28, 14)).toBe(true);
  expect(maze.isPathable(-1, 13)).toBe(false);
});

test("eat removes dot exactly once", () => {
  const maze = Maze.classic();
  expect(maze.eat(1, 1)).toBe(Tile.Dot);
  expect(maze.eat(1, 1)).toBeNull();
  expect(maze.remainingDots).toBe(243);
  maze.reset();
  expect(maze.remainingDots).toBe(244);
});

test("pac start tiles are walkable without dots", () => {
  const maze = Maze.classic();
  expect(maze.tileAt(13, 23)).toBe(Tile.Empty);
  expect(maze.tileAt(14, 23)).toBe(Tile.Empty);
});
