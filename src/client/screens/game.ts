/** Game screen: attract overlay, HUD, canvas, fixed-timestep loop, pause & game over. */
import type { UIScreen } from "../ui/screen";
import { Engine } from "../game/engine";
import { Renderer } from "../game/render";
import { Sfx } from "../audio/sfx";
import { el } from "../ui/dom";
import type { Direction } from "../../shared/directions";

const HI_SCORE_KEY = "pacman-together.hiscore";

const KEY_DIRS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowLeft: "left",
  ArrowDown: "down",
  ArrowRight: "right",
  w: "up",
  a: "left",
  s: "down",
  d: "right",
  W: "up",
  A: "left",
  S: "down",
  D: "right",
};

function loadHiScore(): number {
  const n = Number(localStorage.getItem(HI_SCORE_KEY) ?? "0");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export class GameScreen implements UIScreen {
  private engine = new Engine(loadHiScore());
  private renderer = new Renderer(this.engine);
  private sfx = new Sfx();
  private raf = 0;
  private lastTime = 0;
  private accumulator = 0;
  private phase: "attract" | "run" = "attract";
  private persistedHi = loadHiScore();
  private onKey = (ev: KeyboardEvent): void => this.handleKey(ev);
  private overlay?: HTMLElement;
  private overlayContent?: HTMLElement;
  private overlayToast?: HTMLElement;

  mount(root: HTMLElement): void {
    const wrap = el("div", "screen game-screen");
    const hud = el("div", "hud");
    const hudScore = el("span", "hud-item", "SCORE\n0");
    const hudHi = el("span", "hud-item hud-hi", "HIGH SCORE\n0");
    const hudLevel = el("span", "hud-item", "LEVEL\n1");
    hud.append(hudScore, hudHi, hudLevel);
    this.hudScore = hudScore;
    this.hudHi = hudHi;
    this.hudLevel = hudLevel;

    const stage = el("div", "stage");
    stage.appendChild(this.renderer.canvas);
    this.overlay = el("div", "overlay");
    this.overlayContent = el("div", "overlay-content");
    this.overlayToast = el("div", "overlay-toast");
    this.overlay.append(this.overlayContent, this.overlayToast);
    stage.appendChild(this.overlay);

    const bottom = el("div", "hud hud-bottom");
    this.hudLives = el("span", "hud-item", "");
    const hint = el(
      "span",
      "hud-item hud-hint",
      "ARROWS/WASD steer · P pause · M mute",
    );
    bottom.append(this.hudLives, hint);

    wrap.append(hud, stage, bottom);
    root.appendChild(wrap);

    window.addEventListener("keydown", this.onKey);
    this.showAttract();
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  private hudScore?: HTMLElement;
  private hudHi?: HTMLElement;
  private hudLevel?: HTMLElement;
  private hudLives?: HTMLElement;

  unmount(): void {
    window.removeEventListener("keydown", this.onKey);
    cancelAnimationFrame(this.raf);
    this.sfx.siren(false);
    this.persistHiScore();
  }

  private persistHiScore(): void {
    if (this.engine.hiScore > this.persistedHi) {
      this.persistedHi = this.engine.hiScore;
      localStorage.setItem(HI_SCORE_KEY, String(this.persistedHi));
    }
  }

  private handleKey(ev: KeyboardEvent): void {
    const dir = KEY_DIRS[ev.key];
    if (dir) ev.preventDefault();

    if (ev.key === "m" || ev.key === "M") {
      const muted = this.sfx.toggleMute();
      this.toast(muted ? "muted" : "sound on");
      return;
    }

    if (this.phase === "attract") {
      if (dir) this.startRun();
      return;
    }

    if (this.engine.state === "gameover") {
      if (ev.key === "r" || ev.key === "R") this.startRun();
      if (ev.key === "Escape") this.showAttract();
      return;
    }

    if (ev.key === "p" || ev.key === "P") {
      if (this.engine.state === "playing" || this.engine.paused) {
        this.engine.paused = !this.engine.paused;
        const fright = this.engine.frightTicks > 0;
        this.sfx.siren(!this.engine.paused, fright);
        this.toast(this.engine.paused ? "PAUSED" : "");
      }
      return;
    }

    if (dir) {
      this.sfx.unlock();
      this.engine.pressDirection(dir);
    }
  }

  private startRun(): void {
    this.sfx.unlock();
    this.engine.paused = false;
    this.engine.startRun();
    this.renderer.buildMazeLayer();
    this.phase = "run";
    this.hideOverlay();
    this.toast("");
  }

  private showAttract(): void {
    this.phase = "attract";
    this.engine.startRun();
    this.engine.paused = true;
    this.renderer.buildMazeLayer();
    if (!this.overlay || !this.overlayContent) return;
    this.overlay.classList.add("visible");
    this.overlayToast?.replaceChildren();
    this.overlayContent.innerHTML = `
      <h1 class="logo">PACMAN<span class="together">TOGETHER</span></h1>
      <div class="ghost-roster">
        <span style="--c:#ff3b4e">● Blinky</span>
        <span style="--c:#ff9ddb">● Pinky</span>
        <span style="--c:#4de1ff">● Inky</span>
        <span style="--c:#ffb14d">● Clyde</span>
      </div>
      <p class="subtitle">solo mode — you steer every direction<br />
      multiplayer lobby arrives in the next feature</p>
      <p class="press-start">PRESS ANY ARROW TO START</p>
      <p class="subtitle dim">M mute · P pause</p>
    `;
  }

  private hideOverlay(): void {
    if (!this.overlay) return;
    this.overlay.classList.remove("visible");
    this.overlayContent?.replaceChildren();
    this.overlayToast?.replaceChildren();
  }

  private toast(text: string): void {
    if (!this.overlayToast || !this.overlay) return;
    if (!text) {
      if (this.phase !== "attract" && this.engine.state !== "gameover") {
        this.overlay.classList.remove("visible", "soft");
        this.overlayToast.replaceChildren();
      } else {
        this.overlayToast.replaceChildren();
      }
      return;
    }
    this.overlay.classList.add("visible", "soft");
    this.overlayToast.replaceChildren(el("p", "toast", text));
  }

  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(100, now - this.lastTime);
    this.lastTime = now;
    this.accumulator += dt;
    const stepMs = 1000 / 60;
    let steps = 0;
    while (this.accumulator >= stepMs && steps < 6) {
      const prevState = this.engine.state;
      this.engine.tick();
      if (prevState !== this.engine.state) {
        this.onStateChange(prevState, this.engine.state);
      }
      this.accumulator -= stepMs;
      steps++;
    }
    // drain engine events → audio
    for (const ev of this.engine.events) this.sfx.handleEvent(ev);
    this.engine.events.length = 0;

    this.renderer.draw(now);
    this.updateHud();
  };

  private onStateChange(from: string, to: string): void {
    if (to === "playing" && (from === "ready" || from === "levelclear")) {
      this.sfx.siren(true, this.engine.frightTicks > 0);
    }
    if (to === "dying" || to === "levelclear" || to === "gameover") {
      this.sfx.siren(false);
    }
    if (to === "gameover") this.persistHiScore();
  }

  private updateHud(): void {
    const e = this.engine;
    if (this.hudScore) this.hudScore.textContent = `SCORE\n${e.score}`;
    if (this.hudHi) this.hudHi.textContent = `HIGH SCORE\n${e.hiScore}`;
    if (this.hudLevel) this.hudLevel.textContent = `LEVEL\n${e.level}`;
    if (this.hudLives) this.hudLives.textContent = "♥".repeat(Math.max(0, e.lives - 1));
    if (
      this.phase === "run" &&
      e.state === "gameover" &&
      !this.overlayContent?.hasChildNodes()
    ) {
      this.showGameOver();
    }
  }

  private showGameOver(): void {
    if (!this.overlay || !this.overlayContent) return;
    this.overlay.classList.add("visible");
    this.overlay.classList.remove("soft");
    this.overlayContent.replaceChildren(
      el("p", "gameover-title", "GAME OVER"),
      el("p", "gameover-score", `SCORE ${this.engine.score}`),
      el("p", "subtitle", "R restart · ESC menu"),
    );
  }
}
