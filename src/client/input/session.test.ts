import { beforeEach, describe, expect, test } from "bun:test";
import { Session } from "./session";
import type { DeviceRef } from "./devices";

const keys = (i: number): DeviceRef => ({ kind: "keys", index: i });
const pad = (i: number): DeviceRef => ({ kind: "pad", index: i });

describe("join", () => {
  test("joins up to 4 players with colors in order", () => {
    const s = new Session();
    expect(s.join(keys(0), "ARROWS")?.color).toBe("#ff4d6d");
    expect(s.join(keys(1), "WASD")?.color).toBe("#4dc9ff");
    expect(s.join(pad(0), "PAD 1")?.color).toBe("#b14dff");
    expect(s.join(pad(1), "PAD 2")?.color).toBe("#7dff6d");
    expect(s.join(keys(2), "IJKL")).toBeNull();
  });

  test("same device cannot join twice", () => {
    const s = new Session();
    s.join(keys(0), "ARROWS");
    expect(s.join(keys(0), "ARROWS")).toBeNull();
  });
});

describe("claim / release", () => {
  test("first press wins; own press releases; other press rejected", () => {
    const s = new Session();
    const p1 = s.join(keys(0), "ARROWS")!;
    const p2 = s.join(keys(1), "WASD")!;
    expect(s.claim(p1, "up")).toBe("claimed");
    expect(s.claim(p2, "up")).toBe("taken");
    expect(s.claim(p1, "up")).toBe("freed");
    expect(s.claim(p2, "up")).toBe("claimed");
  });
});

describe("auto-assign leftovers (D2)", () => {
  test("3 players: leftover goes to fewest → join order tiebreak (2/1/1)", () => {
    const s = new Session();
    const p1 = s.join(keys(0), "ARROWS")!;
    const p2 = s.join(keys(1), "WASD")!;
    const p3 = s.join(keys(2), "IJKL")!;
    s.claim(p1, "up");
    s.claim(p2, "down");
    s.claim(p3, "left");
    expect(s.unclaimedDirections).toEqual(["right"]);
    s.autoAssignLeftovers();
    expect(p1.directions.has("right")).toBe(true); // tie 1-1-1 → earliest joiner
    expect([...p1.directions].sort()).toEqual(["right", "up"]);
  });

  test("2 players with staggered counts: fewest gets the extra", () => {
    const s = new Session();
    const p1 = s.join(keys(0), "ARROWS")!;
    const p2 = s.join(keys(1), "WASD")!;
    s.claim(p1, "up");
    s.claim(p1, "left");
    s.claim(p2, "down");
    // leftovers: right → p2 (1 dir) before p1 (2 dirs)
    s.autoAssignLeftovers();
    expect(p2.directions.has("right")).toBe(true);
    expect(p1.directions.size).toBe(2);
    expect(p2.directions.size).toBe(2);
  });

  test("unclaimed directions respect free set", () => {
    const s = new Session();
    const p1 = s.join(keys(0), "ARROWS")!;
    s.claim(p1, "up");
    s.freeDirections.add("down");
    expect(s.unclaimedDirections).toEqual(["left", "right"]);
  });
});

describe("canSteer (D13, D14)", () => {
  test("only owners steer their directions; free dirs open to all", () => {
    const s = new Session();
    const p1 = s.join(keys(0), "ARROWS")!;
    const p2 = s.join(keys(1), "WASD")!;
    s.claim(p1, "left");
    s.claim(p2, "up");
    expect(s.canSteer(keys(0), "left")).toBe(true);
    expect(s.canSteer(keys(0), "up")).toBe(false);
    expect(s.canSteer(keys(1), "up")).toBe(true);
    expect(s.canSteer(pad(0), "left")).toBe(false);
    s.releasePlayerDirections(p2);
    expect(s.canSteer(keys(0), "up")).toBe(true); // freed
  });

  test("disconnected player cannot steer until reconnected", () => {
    const s = new Session();
    const p1 = s.join(pad(0), "PAD 1")!;
    s.claim(p1, "left");
    s.markDisconnected(pad(0));
    expect(s.canSteer(pad(0), "left")).toBe(false);
    s.markReconnected(pad(0));
    expect(s.canSteer(pad(0), "left")).toBe(true);
  });

  test("solo player owns all four", () => {
    const s = new Session();
    s.join(keys(0), "ARROWS");
    s.soloAll();
    expect(s.players[0]!.directions.size).toBe(4);
    expect(s.unclaimedDirections).toEqual([]);
  });

  test("claim cap: cannot take a 2nd direction while someone has none", () => {
    const s = new Session();
    const p1 = s.join(keys(0), "ARROWS")!;
    const p2 = s.join(keys(1), "WASD")!;
    s.claim(p1, "up");
    expect(s.claim(p1, "left")).toBe("blocked"); // p2 still has nothing
    expect(s.claim(p2, "left")).toBe("claimed"); // p2 unaffected
    expect(s.claim(p1, "down")).toBe("claimed"); // cap lifts once everyone has ≥1
  });
});

describe("disconnected edge cases", () => {
  test("disconnected device cannot steer even freed directions", () => {
    const s = new Session();
    const p1 = s.join(pad(0), "PAD 1")!;
    s.claim(p1, "left");
    s.markDisconnected(pad(0));
    s.releasePlayerDirections(p1); // left becomes free
    expect(s.canSteer(pad(0), "left")).toBe(false); // but their dead device still can't
    expect(s.canSteer(keys(0), "left")).toBe(true);
  });

  test("auto-assign skips disconnected players", () => {
    const s = new Session();
    const p1 = s.join(keys(0), "ARROWS")!;
    const p2 = s.join(keys(1), "WASD")!;
    s.claim(p1, "up");
    s.claim(p2, "down");
    s.markDisconnected(keys(1));
    s.autoAssignLeftovers(); // left+right must both go to p1, not p2
    expect(p1.directions.size).toBe(3);
    expect(p2.directions.size).toBe(1);
  });
});
