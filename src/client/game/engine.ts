/** Game engine — pure simulation, no DOM. 60Hz fixed timestep (one tick() = one tick). */
import {
  BASE_PX_PER_TICK,
  BLINKY_START,
  CORNER_TOLERANCE,
  DEATH_ANIM_TICKS,
  DEATH_FREEZE_TICKS,
  DEATH_PAUSE_TICKS,
  EAT_GHOST_FREEZE_TICKS,
  EYES_SPEED,
  EXTRA_LIFE_AT,
  FRUIT_DOT_TRIGGERS,
  FRUIT_POS,
  FRUIT_TICKS,
  HOUSE_CENTER,
  HOUSE_CLYDE_X,
  HOUSE_INKY_X,
  HOUSE_SPEED,
  LEVEL_CLEAR_TICKS,
  PAC_START,
  READY_TICKS,
  SCORE_DOT,
  SCORE_ENERGIZER,
  SCORE_GHOST_CHAIN,
  START_LIVES,
  elroyThresholds,
  frightSeconds,
  fruitForLevel,
  houseExitRules,
  inTunnelZone,
  scatterSchedule,
  speedTable,
  type FruitSpec,
} from "./constants";
import { Maze } from "./maze";
import {
  SCATTER_TARGETS,
  chooseFrightenedDirection,
  chooseGhostDirection,
  clydeTarget,
  inkyTarget,
  pinkyTarget,
  type Ghost,
  type GhostName,
} from "./ghosts";
import {
  DIR_VEC,
  OPPOSITE,
  dirIndex,
  type DirIndex,
  type Direction,
} from "../../shared/directions";

export type EngineState = "ready" | "playing" | "dying" | "levelclear" | "gameover";

export type GameEvent =
  | { type: "dot" }
  | { type: "energizer" }
  | { type: "eatGhost"; points: number }
  | { type: "fruit"; points: number }
  | { type: "death" }
  | { type: "extraLife" }
  | { type: "levelClear"; level: number }
  | { type: "gameOver"; score: number }
  | { type: "frightStart"; seconds: number }
  | { type: "frightEnd" };

export interface Popup {
  x: number;
  y: number;
  text: string;
  ttl: number;
  maxTtl: number;
}

interface Pac {
  x: number;
  y: number;
  dir: DirIndex;
  desired: DirIndex;
  moving: boolean;
  mouth: number; // 0..1 animation phase
}

interface Walker {
  x: number;
  y: number;
  dir: DirIndex;
}

function tileOf(x: number, y: number): { tx: number; ty: number } {
  return { tx: Math.floor(x / 8), ty: Math.floor(y / 8) };
}

const EPS = 1e-6;

/**
 * Moves a walker along its direction up to `speed` px, invoking `decide` at
 * every tile center reached. `decide` returns the direction to continue in
 * (already validated pathable by caller) or null to stop (blocked).
 * Handles the tunnel wrap. Returns false if the walker ended blocked at a center.
 */
function walk(
  w: Walker,
  speed: number,
  maze: Maze,
  decide: (tx: number, ty: number) => DirIndex | null,
): boolean {
  let remaining = speed;
  let lastKey = Number.NaN;
  let guard = 0;
  while (remaining > EPS && guard++ < 12) {
    const { tx, ty } = tileOf(w.x, w.y);
    const key = tx * 1000 + ty;
    const cx = tx * 8 + 4;
    const cy = ty * 8 + 4;
    const v = DIR_VEC[w.dir]!;
    const along = v.dx !== 0 ? (w.x - cx) * v.dx : (w.y - cy) * v.dy;

    if (along <= EPS && key !== lastKey) {
      // move to the center of this tile first
      const dist = -along;
      if (dist > EPS) {
        const step = Math.min(remaining, dist);
        w.x += v.dx * step;
        w.y += v.dy * step;
        remaining -= step;
        if (step < dist - EPS) break; // exhausted mid-tile
        if (v.dx !== 0) w.x = cx;
        else w.y = cy; // snap onto the center
      }
      // decide at the center
      const nd = decide(tx, ty);
      if (nd === null) return false;
      const nv = DIR_VEC[nd]!;
      if (!maze.isPathable(tx + nv.dx, ty + nv.dy)) return false;
      w.dir = nd;
      lastKey = key;
      if (remaining <= EPS) break;
      // move off the center toward the next one
      const step = Math.min(remaining, 8);
      w.x += nv.dx * step;
      w.y += nv.dy * step;
      remaining -= step;
      continue;
    }

    // past this tile's center (already decided): head for the next center
    const dist = 8 - along;
    const step = Math.min(remaining, dist);
    const nv = DIR_VEC[w.dir]!;
    w.x += nv.dx * step;
    w.y += nv.dy * step;
    remaining -= step;
    if (step < dist - EPS) break; // exhausted mid-tile
    // arrived at the next center; loop re-runs with a fresh tile key → decide
  }
  if (w.x < -4) w.x += 232;
  else if (w.x > 228) w.x -= 232;
  return true;
}

export class Engine {
  maze: Maze;
  state: EngineState = "ready";
  stateTicks = 0;
  paused = false;
  level = 1;
  score = 0;
  lives = START_LIVES;
  hiScore: number;
  pac: Pac;
  ghosts: Ghost[];
  frightTicks = 0;
  ghostChain = 0;
  dotsEaten = 0;
  extraLifeGiven = false;
  fruit: { ticks: number; spec: FruitSpec } | null = null;
  fruitSpawned = 0;
  events: GameEvent[] = [];
  popups: Popup[] = [];
  freezeTicks = 0;
  phaseIndex = 0;
  phaseTicks = 0;
  /** ticks since the run started (for the game record duration) */
  runTicks = 0;

  constructor(hiScore = 0) {
    this.hiScore = hiScore;
    this.maze = Maze.classic();
    this.pac = this.makePac();
    this.ghosts = this.makeGhosts();
  }

  /** Full reset: new run from level 1. */
  startRun(): void {
    this.level = 1;
    this.score = 0;
    this.lives = START_LIVES;
    this.extraLifeGiven = false;
    this.dotsEaten = 0;
    this.fruitSpawned = 0;
    this.maze.reset();
    this.fruit = null;
    this.events = [];
    this.popups = [];
    this.runTicks = 0;
    this.resetPositions();
    this.state = "ready";
    this.stateTicks = 0;
  }

  private makePac(): Pac {
    return {
      x: PAC_START.x,
      y: PAC_START.y,
      dir: 3,
      desired: 3,
      moving: true,
      mouth: 0,
    };
  }

  private makeGhosts(): Ghost[] {
    const rules = houseExitRules(this.level);
    const mk = (
      name: GhostName,
      x: number,
      state: Ghost["state"],
      exitDots: number,
      exitTicks: number,
    ): Ghost => ({
      name,
      x,
      y: state === "active" ? BLINKY_START.y : HOUSE_CENTER.y,
      dir: state === "active" ? 1 : 0,
      state,
      frightened: false,
      houseTicks: 0,
      exitDots,
      exitTicks,
      elroy: 0,
      scatterTarget: SCATTER_TARGETS[name],
    });
    return [
      mk("blinky", BLINKY_START.x, "active", 0, 0),
      mk("pinky", HOUSE_CENTER.x, "house", rules.pinky.dots, rules.pinky.ticks),
      mk("inky", HOUSE_INKY_X, "house", rules.inky.dots, rules.inky.ticks),
      mk("clyde", HOUSE_CLYDE_X, "house", rules.clyde.dots, rules.clyde.ticks),
    ];
  }

  /** Reset actors for a new life/level (dots untouched). */
  resetPositions(): void {
    this.pac = this.makePac();
    this.ghosts = this.makeGhosts();
    this.frightTicks = 0;
    this.ghostChain = 0;
    this.freezeTicks = 0;
    this.fruit = null;
    this.popups = [];
    this.phaseIndex = 0;
    this.phaseTicks = 0;
  }

  get mode(): "scatter" | "chase" {
    const phases = scatterSchedule(this.level);
    return (phases[this.phaseIndex] ?? phases[phases.length - 1]!).mode;
  }

  /** Direction press (ownership filtering happens in GameScreen via Session). */
  pressDirection(d: Direction): void {
    this.pac.desired = dirIndex(d);
  }

  tick(): void {
    if (this.paused) return;
    // duration metric counts actual gameplay only (D18)
    if (this.state === "playing") this.runTicks++;
    switch (this.state) {
      case "ready":
        if (++this.stateTicks >= READY_TICKS) {
          this.state = "playing";
          this.stateTicks = 0;
        }
        return;
      case "playing":
        this.tickPlaying();
        return;
      case "dying":
        this.tickDying();
        return;
      case "levelclear":
        this.tickLevelClear();
        return;
      case "gameover":
        this.tickPopups();
        return;
    }
  }

  private tickPlaying(): void {
    if (this.freezeTicks > 0) {
      this.freezeTicks--;
      this.tickPopups();
      return;
    }

    this.tickModeSchedule();
    if (this.frightTicks > 0) {
      if (--this.frightTicks === 0) {
        for (const g of this.ghosts) g.frightened = false;
        this.events.push({ type: "frightEnd" });
      }
    }

    this.tickPac();
    if (this.checkLevelClear()) return;
    for (const g of this.ghosts) this.tickGhost(g);
    this.tickFruit();
    this.tickPopups();
    this.checkCollisions();
  }

  private tickModeSchedule(): void {
    if (this.frightTicks > 0) return; // paused during fright
    const phases = scatterSchedule(this.level);
    const phase = phases[this.phaseIndex];
    if (!phase) return;
    this.phaseTicks++;
    if (this.phaseTicks >= phase.seconds * 60) {
      this.phaseIndex = Math.min(this.phaseIndex + 1, phases.length - 1);
      this.phaseTicks = 0;
      if (this.phaseIndex < phases.length - 1 || phase.mode !== "chase") {
        this.reverseGhosts();
      }
    }
  }

  private reverseGhosts(): void {
    for (const g of this.ghosts) {
      if (g.state === "active") g.dir = OPPOSITE[g.dir]!;
    }
  }

  private tickPac(): void {
    const pac = this.pac;
    this.tryPacTurn(pac);

    if (!pac.moving) {
      const dv = DIR_VEC[pac.desired]!;
      const { tx, ty } = tileOf(pac.x, pac.y);
      if (this.maze.isPathable(tx + dv.dx, ty + dv.dy)) {
        pac.dir = pac.desired;
        pac.moving = true;
      } else {
        const cv = DIR_VEC[pac.dir]!;
        if (this.maze.isPathable(tx + cv.dx, ty + cv.dy)) pac.moving = true;
      }
    }

    if (pac.moving) {
      const tbl = speedTable(this.level);
      const pct = this.frightTicks > 0 ? tbl.pacFright : tbl.pac;
      const blocked = walk(pac, (BASE_PX_PER_TICK * pct) / 100, this.maze, (tx, ty) => {
        const dvn = DIR_VEC[pac.desired]!;
        if (this.maze.isPathable(tx + dvn.dx, ty + dvn.dy)) return pac.desired;
        const dvc = DIR_VEC[pac.dir]!;
        if (this.maze.isPathable(tx + dvc.dx, ty + dvc.dy)) return pac.dir;
        return null;
      });
      if (!blocked) pac.moving = false;
      else pac.mouth = (pac.mouth + 0.22) % 1;
    }

    this.eatAtPacTile();
  }

  /** Instant reverse + buffered perpendicular turn with cornering tolerance. */
  private tryPacTurn(pac: Pac): void {
    if (pac.desired === pac.dir) return;
    if (pac.desired === OPPOSITE[pac.dir]) {
      pac.dir = pac.desired;
      return;
    }
    const { tx, ty } = tileOf(pac.x, pac.y);
    const cx = tx * 8 + 4;
    const cy = ty * 8 + 4;
    const v = DIR_VEC[pac.desired]!;
    if (
      Math.abs(pac.x - cx) <= CORNER_TOLERANCE &&
      Math.abs(pac.y - cy) <= CORNER_TOLERANCE &&
      this.maze.isPathable(tx + v.dx, ty + v.dy)
    ) {
      pac.x = cx;
      pac.y = cy;
      pac.dir = pac.desired;
      pac.moving = true;
    }
  }

  private eatAtPacTile(): void {
    const { tx, ty } = tileOf(this.pac.x, this.pac.y);
    const eaten = this.maze.eat(tx, ty);
    if (!eaten) return;
    this.dotsEaten++;
    this.updateElroy();
    if (eaten === 1) {
      // Tile.Dot
      this.addScore(SCORE_DOT);
      this.events.push({ type: "dot" });
    } else {
      this.addScore(SCORE_ENERGIZER);
      this.events.push({ type: "energizer" });
      this.startFright();
    }
    if (
      this.fruitSpawned < FRUIT_DOT_TRIGGERS.length &&
      this.dotsEaten === FRUIT_DOT_TRIGGERS[this.fruitSpawned]
    ) {
      this.fruit = { ticks: FRUIT_TICKS, spec: fruitForLevel(this.level) };
      this.fruitSpawned++;
    }
  }

  private updateElroy(): void {
    const blinky = this.ghosts[0]!;
    const { e1, e2 } = elroyThresholds(this.level);
    const remaining = this.maze.remainingDots;
    blinky.elroy = remaining <= e2 ? 2 : remaining <= e1 ? 1 : 0;
  }

  private startFright(): void {
    const seconds = frightSeconds(this.level);
    this.reverseGhosts();
    this.ghostChain = 0;
    this.events.push({ type: "frightStart", seconds });
    if (seconds <= 0) return;
    this.frightTicks = Math.round(seconds * 60);
    for (const g of this.ghosts) {
      if (g.state === "eyes" || g.state === "entering") continue;
      g.frightened = true;
    }
  }

  private ghostSpeed(g: Ghost): number {
    if (g.state === "eyes") return (BASE_PX_PER_TICK * EYES_SPEED) / 100;
    const tbl = speedTable(this.level);
    const { tx, ty } = tileOf(g.x, g.y);
    let pct: number;
    if (g.frightened) {
      pct = tbl.ghostFright;
    } else {
      pct = tbl.ghost;
      if (g.elroy === 2) pct += 10;
      else if (g.elroy === 1) pct += 5;
    }
    if (inTunnelZone(tx, ty)) pct = tbl.tunnel;
    return (BASE_PX_PER_TICK * pct) / 100;
  }

  private tickGhost(g: Ghost): void {
    if (g.state === "house") {
      this.tickGhostHouse(g);
      return;
    }
    if (g.state === "leaving" || g.state === "entering") {
      this.tickGhostTransition(g);
      return;
    }

    const speed = this.ghostSpeed(g);
    walk(g, speed, this.maze, (tx, ty) => {
      if (tx < 0 || tx >= this.maze.cols) return g.dir; // tunnel OOB: straight
      if (g.state === "eyes") {
        return chooseGhostDirection(this.maze, tx, ty, g.dir, { x: 13, y: 11 }, { eyes: true });
      }
      if (g.frightened) {
        return chooseFrightenedDirection(this.maze, tx, ty, g.dir);
      }
      const target = this.chaseTarget(g);
      return chooseGhostDirection(this.maze, tx, ty, g.dir, target, { eyes: false });
    });

    if (g.state === "eyes") {
      const { tx, ty } = tileOf(g.x, g.y);
      if (ty === 11 && (tx === 13 || tx === 14) && Math.abs(g.y - 92) < 1.5) {
        g.x = HOUSE_CENTER.x;
        g.y = 92;
        g.state = "entering";
      }
    }
  }

  private chaseTarget(g: Ghost): { x: number; y: number } {
    const pac = this.pac;
    const { tx, ty } = tileOf(pac.x, pac.y);
    if (this.mode === "scatter" && !(g.name === "blinky" && g.elroy > 0)) {
      return g.scatterTarget;
    }
    switch (g.name) {
      case "blinky":
        return { x: tx, y: ty };
      case "pinky":
        return pinkyTarget(tx, ty, pac.dir);
      case "inky": {
        const b = this.ghosts[0]!;
        const bt = tileOf(b.x, b.y);
        return inkyTarget(tx, ty, pac.dir, bt.tx, bt.ty);
      }
      case "clyde": {
        const gt = tileOf(g.x, g.y);
        return clydeTarget(gt.tx, gt.ty, tx, ty);
      }
    }
  }

  private tickGhostHouse(g: Ghost): void {
    g.houseTicks++;
    // bob between y 112 and 120
    g.y += g.dir === 0 ? -0.4 : 0.4;
    if (g.y <= 112) {
      g.y = 112;
      g.dir = 2;
    } else if (g.y >= 120) {
      g.y = 120;
      g.dir = 0;
    }
    const mayLeave =
      (Number.isFinite(g.exitDots) && this.dotsEaten >= g.exitDots) ||
      g.houseTicks >= g.exitTicks;
    if (mayLeave) g.state = "leaving";
  }

  private tickGhostTransition(g: Ghost): void {
    const speed = (BASE_PX_PER_TICK * HOUSE_SPEED) / 100;
    if (g.state === "leaving") {
      if (Math.abs(g.x - HOUSE_CENTER.x) > speed) {
        g.x += Math.sign(HOUSE_CENTER.x - g.x) * speed;
      } else {
        g.x = HOUSE_CENTER.x;
        g.y -= speed;
        if (g.y <= BLINKY_START.y) {
          g.y = BLINKY_START.y;
          g.state = "active";
          g.dir = 1; // exits facing left
        }
      }
      return;
    }
    // entering (eyes descending into the house)
    if (Math.abs(g.x - HOUSE_CENTER.x) > speed) {
      g.x += Math.sign(HOUSE_CENTER.x - g.x) * speed;
    } else {
      g.x = HOUSE_CENTER.x;
      g.y += speed;
      if (g.y >= HOUSE_CENTER.y) {
        g.y = HOUSE_CENTER.y;
        g.state = "house";
        g.frightened = false;
        g.houseTicks = 0;
        g.exitDots = 0;
        g.exitTicks = 90; // revived ghosts leave promptly
        g.dir = 0;
      }
    }
  }

  private tickFruit(): void {
    if (!this.fruit) return;
    if (--this.fruit.ticks <= 0) {
      this.fruit = null;
      return;
    }
    if (
      Math.abs(this.pac.x - FRUIT_POS.x) <= 6 &&
      Math.abs(this.pac.y - FRUIT_POS.y) <= 6
    ) {
      const points = this.fruit.spec.points;
      this.addScore(points);
      this.popups.push({
        x: FRUIT_POS.x,
        y: FRUIT_POS.y,
        text: String(points),
        ttl: 70,
        maxTtl: 70,
      });
      this.events.push({ type: "fruit", points });
      this.fruit = null;
    }
  }

  private tickPopups(): void {
    for (const p of this.popups) {
      p.ttl--;
      p.y -= 0.25;
    }
    this.popups = this.popups.filter((p) => p.ttl > 0);
  }

  private checkCollisions(): void {
    const pac = this.pac;
    const { tx, ty } = tileOf(pac.x, pac.y);
    for (const g of this.ghosts) {
      if (g.state !== "active") continue;
      const gt = tileOf(g.x, g.y);
      if (gt.tx !== tx || gt.ty !== ty) continue;
      if (g.frightened) {
        const points = SCORE_GHOST_CHAIN[Math.min(this.ghostChain, 3)]!;
        this.ghostChain++;
        g.state = "eyes";
        g.frightened = false;
        this.freezeTicks = EAT_GHOST_FREEZE_TICKS;
        this.addScore(points);
        this.popups.push({
          x: g.x,
          y: g.y,
          text: String(points),
          ttl: 70,
          maxTtl: 70,
        });
        this.events.push({ type: "eatGhost", points });
      } else {
        this.events.push({ type: "death" });
        this.state = "dying";
        this.stateTicks = 0;
        return;
      }
    }
  }

  private tickDying(): void {
    this.stateTicks++;
    const total = DEATH_FREEZE_TICKS + DEATH_ANIM_TICKS + DEATH_PAUSE_TICKS;
    if (this.stateTicks < total) return;
    this.lives--;
    if (this.lives > 0) {
      this.resetPositions();
      this.state = "ready";
      this.stateTicks = 0;
    } else {
      this.state = "gameover";
      this.stateTicks = 0;
      this.events.push({ type: "gameOver", score: this.score });
    }
  }

  private tickLevelClear(): void {
    this.stateTicks++;
    if (this.stateTicks >= LEVEL_CLEAR_TICKS) {
      this.level++;
      this.maze.reset();
      this.dotsEaten = 0;
      this.fruitSpawned = 0;
      this.fruit = null;
      this.resetPositions();
      this.state = "ready";
      this.stateTicks = 0;
    }
  }

  private checkLevelClear(): boolean {
    if (this.maze.remainingDots === 0) {
      this.state = "levelclear";
      this.stateTicks = 0;
      this.fruit = null;
      this.events.push({ type: "levelClear", level: this.level });
      return true;
    }
    return false;
  }

  private addScore(points: number): void {
    this.score += points;
    if (this.score > this.hiScore) this.hiScore = this.score;
    if (!this.extraLifeGiven && this.score >= EXTRA_LIFE_AT) {
      this.extraLifeGiven = true;
      this.lives++;
      this.events.push({ type: "extraLife" });
    }
  }

  /** Progress of the death animation for the renderer (0..1, or -1 when frozen). */
  get deathAnimProgress(): number {
    if (this.state !== "dying") return -1;
    const t = this.stateTicks - DEATH_FREEZE_TICKS;
    return t <= 0 ? 0 : Math.min(1, t / DEATH_ANIM_TICKS);
  }
}
