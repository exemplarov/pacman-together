/** Canvas renderer — neon arcade-modern look (D1). Draws an Engine at 3× scale. */
import {
  COLORS,
  COLS,
  FRUIT_POS,
  H,
  ROWS,
  TILE,
  W,
} from "./constants";
import type { Engine } from "./engine";
import { Tile } from "./maze";
import { FRIGHT_FLASH_SEC } from "./constants";

const SCALE = 3;

/** wall edge segments (tile coords) computed once per maze */
interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function wallSegments(engine: Engine): Seg[] {
  const segs: Seg[] = [];
  const maze = engine.maze;
  const walkable = (tx: number, ty: number): boolean => {
    if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return false;
    const t = maze.tileAt(tx, ty);
    return (
      t === Tile.Dot || t === Tile.Energizer || t === Tile.Tunnel || t === Tile.Empty ||
      t === Tile.Door
    );
  };
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      if (maze.tileAt(tx, ty) !== Tile.Wall) continue;
      const x = tx * TILE;
      const y = ty * TILE;
      if (walkable(tx, ty - 1)) segs.push({ x1: x, y1: y, x2: x + TILE, y2: y });
      if (walkable(tx, ty + 1)) segs.push({ x1: x, y1: y + TILE, x2: x + TILE, y2: y + TILE });
      if (walkable(tx - 1, ty)) segs.push({ x1: x, y1: y, x2: x, y2: y + TILE });
      if (walkable(tx + 1, ty)) segs.push({ x1: x + TILE, y1: y, x2: x + TILE, y2: y + TILE });
    }
  }
  return segs;
}

function segsToPath(segs: readonly Seg[]): Path2D {
  const p = new Path2D();
  for (const s of segs) {
    p.moveTo(s.x1, s.y1);
    p.lineTo(s.x2, s.y2);
  }
  return p;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private wallPath!: Path2D;
  private wallColor = "#2a2aff";
  private doorPath!: Path2D;

  constructor(private engine: Engine) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W * SCALE;
    this.canvas.height = H * SCALE;
    this.canvas.className = "game-canvas";
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.buildMazeLayer();
  }

  /** Rebuild static maze layer (call on level change for the hue shift). */
  buildMazeLayer(): void {
    this.wallPath = segsToPath(wallSegments(this.engine));
    // subtle per-level hue drift around the classic blue
    const hue = (222 + (this.engine.level - 1) * 14) % 360;
    this.wallColor = `hsl(${hue} 100% 64%)`;
    const d = new Path2D();
    d.moveTo(13 * TILE, 12 * TILE + 5);
    d.lineTo(15 * TILE, 12 * TILE + 5);
    this.doorPath = d;
  }

  draw(timeMs: number): void {
    const e = this.engine;
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(SCALE, SCALE);

    // background
    ctx.fillStyle = "#05060f";
    ctx.fillRect(0, 0, W, H);

    this.drawMaze(ctx, timeMs);
    this.drawPellets(ctx, timeMs);
    this.drawFruit(ctx);
    if (e.state !== "gameover") {
      if (e.state !== "levelclear" || Math.floor(e.stateTicks / 15) % 2 === 0) {
        this.drawPac(ctx);
      }
    }
    if (e.state !== "dying" && e.state !== "levelclear") {
      for (const g of e.ghosts) this.drawGhost(ctx, g, timeMs);
    }
    this.drawPopups(ctx);
    this.drawBanner(ctx);

    ctx.restore();
  }

  private drawMaze(ctx: CanvasRenderingContext2D, timeMs: number): void {
    const e = this.engine;
    const flash = e.state === "levelclear" && Math.floor(e.stateTicks / 15) % 2 === 1;
    const color = flash ? "#ffffff" : this.wallColor;

    // wide soft glow pass
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.stroke(this.wallPath);
    ctx.restore();

    // bright core line
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = 6 + Math.sin(timeMs / 600) * 1.2;
    ctx.stroke(this.wallPath);
    ctx.restore();

    // ghost house door
    ctx.save();
    ctx.strokeStyle = COLORS.door;
    ctx.lineWidth = 2;
    ctx.shadowColor = COLORS.door;
    ctx.shadowBlur = 6;
    ctx.stroke(this.doorPath);
    ctx.restore();
  }

  private drawPellets(ctx: CanvasRenderingContext2D, timeMs: number): void {
    const maze = this.engine.maze;
    ctx.save();
    ctx.fillStyle = COLORS.dot;
    ctx.shadowColor = COLORS.dot;
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const t = maze.tileAt(tx, ty);
        const x = tx * TILE + 4;
        const y = ty * TILE + 4;
        if (t === Tile.Dot) {
          ctx.shadowBlur = 2;
          ctx.fillRect(x - 1, y - 1, 2, 2);
        } else if (t === Tile.Energizer) {
          const r = 3 + Math.sin(timeMs / 180 + tx) * 1.1;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  private drawFruit(ctx: CanvasRenderingContext2D): void {
    const fruit = this.engine.fruit;
    if (!fruit) return;
    const { x, y } = FRUIT_POS;
    ctx.save();
    ctx.shadowBlur = 8;
    // body
    ctx.shadowColor = fruit.spec.color;
    ctx.fillStyle = fruit.spec.color;
    ctx.beginPath();
    ctx.arc(x - 2, y + 1, 3, 0, Math.PI * 2);
    ctx.arc(x + 2, y + 2, 3, 0, Math.PI * 2);
    ctx.fill();
    // leaf/stem
    ctx.shadowColor = fruit.spec.color2;
    ctx.strokeStyle = fruit.spec.color2;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 1, y - 2);
    ctx.quadraticCurveTo(x + 2, y - 5, x + 4, y - 4);
    ctx.stroke();
    ctx.restore();
  }

  private drawPac(ctx: CanvasRenderingContext2D): void {
    const e = this.engine;
    const pac = e.pac;
    if (e.freezeTicks > 0) {
      // pac hidden briefly while ghost-eat popup shows (classic behavior)
      return;
    }
    let mouth = 0.5 + Math.sin(pac.mouth * Math.PI * 2) * 0.5; // 0..1
    mouth = 0.08 + mouth * 0.42; // radians fraction (of π)

    if (e.state === "dying") {
      const p = e.deathAnimProgress;
      if (p < 0) return;
      mouth = 0.08 + p * 0.92;
      if (p >= 1) return;
    }

    const dirAngle = [ -Math.PI / 2, Math.PI, Math.PI / 2, 0 ][pac.dir]!;
    ctx.save();
    ctx.translate(pac.x, pac.y);
    ctx.rotate(dirAngle);
    ctx.fillStyle = COLORS.pac;
    ctx.shadowColor = COLORS.pac;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 6.5, mouth * Math.PI, (2 - mouth) * Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawGhost(
    ctx: CanvasRenderingContext2D,
    g: Engine["ghosts"][number],
    timeMs: number,
  ): void {
    const eyesOnly = g.state === "eyes" || g.state === "entering";
    const fright = g.frightened && !eyesOnly;
    const flash =
      fright &&
      this.engine.frightTicks < FRIGHT_FLASH_SEC * 60 &&
      Math.floor(timeMs / 130) % 2 === 0;

    const body = eyesOnly
      ? "rgba(0,0,0,0)"
      : fright
        ? (flash ? COLORS.frightFlash : COLORS.frightBody)
        : COLORS.ghost[g.name];

    ctx.save();
    ctx.translate(g.x, g.y);

    if (!eyesOnly) {
      // body: dome + wavy skirt (2-frame wobble)
      ctx.fillStyle = body;
      ctx.shadowColor = body;
      ctx.shadowBlur = 8;
      const wob = Math.floor(timeMs / 120) % 2 === 0 ? 1.5 : 0;
      ctx.beginPath();
      ctx.arc(0, -1, 6.5, Math.PI, 0);
      ctx.lineTo(6.5, 4);
      ctx.lineTo(4.3, 7 - wob);
      ctx.lineTo(2.2, 4);
      ctx.lineTo(0, 7 + wob);
      ctx.lineTo(-2.2, 4);
      ctx.lineTo(-4.3, 7 - wob);
      ctx.lineTo(-6.5, 4);
      ctx.closePath();
      ctx.fill();
    }

    // eyes
    if (fright) {
      // frightened face: pale dots + zigzag mouth
      ctx.fillStyle = COLORS.frightFace;
      ctx.shadowColor = "transparent";
      ctx.fillRect(-3.5, -3, 2, 2.6);
      ctx.fillRect(1.5, -3, 2, 2.6);
      ctx.strokeStyle = COLORS.frightFace;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-3.5, 2.5);
      for (let i = 0; i < 4; i++) {
        ctx.lineTo(-3.5 + (i + 1) * 1.75, i % 2 === 0 ? 1 : 2.5);
      }
      ctx.stroke();
    } else {
      const v = [
        { dx: 0, dy: -1 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 1, dy: 0 },
      ][g.dir]!;
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(-2.4, -1.5, 2, 2.6, 0, 0, Math.PI * 2);
      ctx.ellipse(2.4, -1.5, 2, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2a2aff";
      ctx.beginPath();
      ctx.arc(-2.4 + v.dx * 1.1, -1.5 + v.dy * 1.3, 1.1, 0, Math.PI * 2);
      ctx.arc(2.4 + v.dx * 1.1, -1.5 + v.dy * 1.3, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPopups(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.font = "7px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    for (const p of this.engine.popups) {
      ctx.globalAlpha = Math.min(1, p.ttl / 20);
      ctx.fillStyle = COLORS.popup;
      ctx.shadowColor = COLORS.popup;
      ctx.shadowBlur = 6;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  }

  private drawBanner(ctx: CanvasRenderingContext2D): void {
    const e = this.engine;
    // READY! banner (game-over title lives in the DOM overlay)
    if (e.state !== "ready") return;
    ctx.save();
    ctx.font = "8px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.ready;
    ctx.shadowColor = COLORS.ready;
    ctx.shadowBlur = 10;
    ctx.fillText("READY!", W / 2, FRUIT_POS.y + 3);
    ctx.restore();
  }
}
