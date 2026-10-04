import { beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { initDb, type Db } from "../db";
import { upsertUser, getUserProfile, validateName } from "./users";
import { submitGame, getLeaderboard, type SubmitResult } from "./games";

let db: Db;
beforeEach(() => {
  db = new Database(":memory:");
  initDb(db);
});

/** Unwrap a SubmitResult or throw (fail the test) with the error. */
function ok(res: SubmitResult) {
  if ("error" in res) throw new Error(`expected ok, got: ${res.error}`);
  return res.ok;
}

describe("validateName", () => {
  test("accepts normal names, trims, rejects junk", () => {
    expect(validateName("  ada  ")).toBe("ada");
    expect(validateName("Pac-Man 2")).toBe("Pac-Man 2");
    expect(validateName("")).toBeNull();
    expect(validateName("   ")).toBeNull();
    expect(validateName("x".repeat(17))).toBeNull();
    expect(validateName("bad\nname")).toBeNull();
    expect(validateName(42)).toBeNull();
  });
});

describe("upsertUser", () => {
  test("same name (any case) → same id", () => {
    const a = upsertUser(db, "ada");
    const b = upsertUser(db, "ADA");
    expect(b.id).toBe(a.id);
    expect(b.name).toBe("ada");
  });

  test("different names → different ids", () => {
    expect(upsertUser(db, "ada").id).not.toBe(upsertUser(db, "bob").id);
  });
});

describe("submitGame", () => {
  test("inserts a game with players and returns rank", () => {
    const u1 = upsertUser(db, "ada");
    const u2 = upsertUser(db, "bob");
    const res = ok(submitGame(db, {
      teamScore: 1230,
      level: 2,
      durationSec: 95,
      players: [
        { userId: u1.id, directions: ["up", "left"] },
        { userId: u2.id, directions: ["down", "right"] },
      ],
    }));
    expect(res.gameId).toBeGreaterThan(0);
    expect(res.rank).toBe(1);
  });

  test("rank: higher score first; ties → earlier game wins", () => {
    const u = upsertUser(db, "solo");
    const first = ok(submitGame(db, {
      teamScore: 500,
      level: 1,
      durationSec: 10,
      players: [{ userId: u.id, directions: ["up", "left", "down", "right"] }],
    }));
    const higher = ok(submitGame(db, {
      teamScore: 600,
      level: 1,
      durationSec: 10,
      players: [{ userId: u.id, directions: ["up", "left", "down", "right"] }],
    }));
    const tie = ok(submitGame(db, {
      teamScore: 500,
      level: 1,
      durationSec: 10,
      players: [{ userId: u.id, directions: ["up", "left", "down", "right"] }],
    }));
    // rank is computed at insert time: better + earlier-equal + 1
    expect(first.rank).toBe(1); // first game ever
    expect(higher.rank).toBe(1); // 600 beats the only other game
    expect(tie.rank).toBe(3); // one better (600) + one earlier equal (first) + 1
    // final ordering belongs to the leaderboard query
    const board = getLeaderboard(db, 10);
    expect(board.map((e) => e.teamScore)).toEqual([600, 500, 500]);
  });

  test("rejects invalid payloads", () => {
    const u = upsertUser(db, "x");
    expect("error" in submitGame(db, {
      teamScore: -1,
      level: 1,
      durationSec: 10,
      players: [{ userId: u.id, directions: ["up"] }],
    })).toBe(true);
    expect("error" in submitGame(db, {
      teamScore: 10,
      level: 0,
      durationSec: 10,
      players: [{ userId: u.id, directions: ["up"] }],
    })).toBe(true);
    expect("error" in submitGame(db, {
      teamScore: 10,
      level: 1,
      durationSec: 10,
      players: [],
    })).toBe(true);
    expect("error" in submitGame(db, {
      teamScore: 10,
      level: 1,
      durationSec: 10,
      players: [{ userId: 9999, directions: ["up"] }],
    })).toBe(true);
    expect("error" in submitGame(db, {
      teamScore: 10,
      level: 1,
      durationSec: 10,
      players: [{ userId: u.id, directions: ["north"] }],
    } as unknown as Parameters<typeof submitGame>[1])).toBe(true);
    // duplicate direction across players
    const u2 = upsertUser(db, "y");
    expect("error" in submitGame(db, {
      teamScore: 10,
      level: 1,
      durationSec: 10,
      players: [
        { userId: u.id, directions: ["up"] },
        { userId: u2.id, directions: ["up"] },
      ],
    })).toBe(true);
    // duplicate direction within one player
    expect("error" in submitGame(db, {
      teamScore: 10,
      level: 1,
      durationSec: 10,
      players: [{ userId: u.id, directions: ["up", "up"] }],
    } as unknown as Parameters<typeof submitGame>[1])).toBe(true);
    // boundary values
    expect("ok" in submitGame(db, {
      teamScore: 10_000_000,
      level: 999,
      durationSec: 86_400,
      players: [{ userId: u.id, directions: ["up"] }],
    })).toBe(true);
    expect("error" in submitGame(db, {
      teamScore: 10_000_001,
      level: 1,
      durationSec: 10,
      players: [{ userId: u.id, directions: ["up"] }],
    })).toBe(true);
    // more than 4 players
    const extras = [u2, upsertUser(db, "c"), upsertUser(db, "d"), upsertUser(db, "e")];
    expect(
      "error" in
        submitGame(db, {
          teamScore: 10,
          level: 1,
          durationSec: 10,
          players: [u, ...extras].map((x) => ({ userId: x.id, directions: ["up"] })),
        }),
    ).toBe(true);
  });
});

describe("getLeaderboard", () => {
  test("orders by score desc with players attached", () => {
    const u1 = upsertUser(db, "ada");
    const u2 = upsertUser(db, "bob");
    submitGame(db, {
      teamScore: 100,
      level: 1,
      durationSec: 10,
      players: [{ userId: u1.id, directions: ["up"] }],
    });
    submitGame(db, {
      teamScore: 900,
      level: 3,
      durationSec: 60,
      players: [
        { userId: u1.id, directions: ["left"] },
        { userId: u2.id, directions: ["right"] },
      ],
    });
    const board = getLeaderboard(db, 10);
    expect(board.length).toBe(2);
    expect(board[0]!.teamScore).toBe(900);
    expect(board[0]!.players.length).toBe(2);
    expect(board[0]!.players.map((p) => p.name)).toEqual(["ada", "bob"]);
    expect(board[0]!.players[0]!.directions).toEqual(["left"]);
    expect(board[1]!.teamScore).toBe(100);
  });

  test("respects limit", () => {
    const u = upsertUser(db, "z");
    for (let i = 0; i < 5; i++) {
      submitGame(db, {
        teamScore: 100 + i,
        level: 1,
        durationSec: 10,
        players: [{ userId: u.id, directions: ["up"] }],
      });
    }
    expect(getLeaderboard(db, 3).length).toBe(3);
    expect(getLeaderboard(db, 0).length).toBe(1); // clamped to min 1
  });
});

describe("getUserProfile", () => {
  test("aggregates stats across games", () => {
    const u = upsertUser(db, "ada");
    submitGame(db, { teamScore: 100, level: 1, durationSec: 10, players: [{ userId: u.id, directions: ["up"] }] });
    submitGame(db, { teamScore: 700, level: 2, durationSec: 50, players: [{ userId: u.id, directions: ["up"] }] });
    const profile = getUserProfile(db, u.id)!;
    expect(profile.gamesPlayed).toBe(2);
    expect(profile.bestTeamScore).toBe(700);
    expect(profile.totalPoints).toBe(800);
  });

  test("unknown id → null", () => {
    expect(getUserProfile(db, 12345)).toBeNull();
  });
});
