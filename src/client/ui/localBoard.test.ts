import { beforeEach, describe, expect, test } from "bun:test";
import {
  addLocalGame,
  loadBoard,
  nextLocalUserId,
  rankOf,
  topEntries,
  type KeyValueStorage,
} from "./localBoard";

class Mem implements KeyValueStorage {
  map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

let s: Mem;
beforeEach(() => {
  s = new Mem();
});

describe("localBoard", () => {
  test("empty board loads and tops empty", () => {
    expect(loadBoard(s)).toEqual([]);
    expect(topEntries(10, s)).toEqual([]);
  });

  test("entries persist, sort score desc then insertion order", () => {
    addLocalGame({ teamScore: 100, level: 1, players: [{ name: "a", directions: ["up"] }] }, s);
    addLocalGame({ teamScore: 300, level: 2, players: [{ name: "b", directions: ["left"] }] }, s);
    addLocalGame({ teamScore: 300, level: 1, players: [{ name: "c", directions: ["down"] }] }, s);
    const board = loadBoard(s);
    expect(board.map((e) => e.teamScore)).toEqual([300, 300, 100]);
    // equal scores: earlier insertion first
    expect(board[0]!.players[0]!.name).toBe("b");
    expect(board[1]!.players[0]!.name).toBe("c");
    expect(board.every((e) => e.createdAt)).toBe(true);
  });

  test("rank math matches server semantics", () => {
    addLocalGame({ teamScore: 500, level: 1, players: [{ name: "a", directions: ["up"] }] }, s);
    addLocalGame({ teamScore: 600, level: 1, players: [{ name: "b", directions: ["up"] }] }, s);
    const tie = addLocalGame(
      { teamScore: 500, level: 1, players: [{ name: "c", directions: ["up"] }] },
      s,
    );
    expect(rankOf(loadBoard(s), tie)).toBe(3); // 600 better + 500 earlier-equal + 1
  });

  test("board caps at 100 entries, lowest scores dropped", () => {
    for (let i = 0; i < 120; i++) {
      addLocalGame(
        { teamScore: i, level: 1, players: [{ name: `p${i}`, directions: ["up"] }] },
        s,
      );
    }
    const board = loadBoard(s);
    expect(board.length).toBe(100);
    expect(board[0]!.teamScore).toBe(119);
    expect(board[99]!.teamScore).toBe(20);
  });

  test("synthetic user ids are negative and decreasing", () => {
    expect(nextLocalUserId(s)).toBe(-1);
    expect(nextLocalUserId(s)).toBe(-2);
    expect(nextLocalUserId(s)).toBe(-3);
  });

  test("corrupted storage resets to empty board", () => {
    s.setItem("pacman-together.local-board", "{not json");
    expect(loadBoard(s)).toEqual([]);
  });
});
