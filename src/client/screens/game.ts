/** Game screen: HUD, canvas, fixed-timestep loop, shared-control input, pause & game over. */
import type { UIScreen } from "../ui/screen";
import { navigate } from "../ui/nav";
import { Engine } from "../game/engine";
import { Renderer } from "../game/render";
import { Sfx } from "../audio/sfx";
import { el } from "../ui/dom";
import { DIRECTIONS, type Direction } from "../../shared/directions";
import type { InputSystem, InputEvent } from "../input/devices";
import type { Session } from "../input/session";
import { LobbyScreen } from "./lobby";

const HI_SCORE_KEY = "pacman-together.hiscore";

const DIR_GLYPH: Record<Direction, string> = {
  up: "▲",
  left: "◀",
  down: "▼",
  right: "▶",
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
  private persistedHi = loadHiScore();
  private disconnectPaused = false;
  private onKey = (ev: KeyboardEvent): void => this.handleKey(ev);
  private overlay?: HTMLElement;
  private overlayContent?: HTMLElement;
  private overlayToast?: HTMLElement;
  private hudScore?: HTMLElement;
  private hudHi?: HTMLElement;
  private hudLevel?: HTMLElement;
  private hudLives?: HTMLElement;
  private strip?: HTMLElement;

  constructor(
    private session: Session,
    private input: InputSystem,
  ) {}

  mount(root: HTMLElement): void {
    const wrap = el("div", "screen game-screen");
    const hud = el("div", "hud");
    this.hudScore = el("span", "hud-item", "SCORE\n0");
    this.hudHi = el("span", "hud-item hud-hi", "HIGH SCORE\n0");
    this.hudLevel = el("span", "hud-item", "LEVEL\n1");
    hud.append(this.hudScore, this.hudHi, this.hudLevel);

    const stage = el("div", "stage");
    stage.appendChild(this.renderer.canvas);
    this.overlay = el("div", "overlay");
    this.overlayContent = el("div", "overlay-content");
    this.overlayToast = el("div", "overlay-toast");
    this.overlay.append(this.overlayContent, this.overlayToast);
    stage.appendChild(this.overlay);

    this.strip = el("div", "control-strip");
    for (const p of this.session.players) {
      this.strip.appendChild(this.playerChip(p));
    }
    this.strip.appendChild(this.freedChip());

    const bottom = el("div", "hud hud-bottom");
    this.hudLives = el("span", "hud-item", "");
    const hint = el("span", "hud-item hud-hint", "P pause · M mute");
    bottom.append(this.hudLives, hint);

    wrap.append(hud, stage, this.strip, bottom);
    root.appendChild(wrap);

    window.addEventListener("keydown", this.onKey);
    this.showReadyOverlay();
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  unmount(): void {
    window.removeEventListener("keydown", this.onKey);
    cancelAnimationFrame(this.raf);
    this.sfx.siren(false);
    this.persistHiScore();
    this.input.dispose();
  }

  private persistHiScore(): void {
    if (this.engine.hiScore > this.persistedHi) {
      this.persistedHi = this.engine.hiScore;
      localStorage.setItem(HI_SCORE_KEY, String(this.persistedHi));
    }
  }

  private handleKey(ev: KeyboardEvent): void {
    if (ev.repeat) return;
    if (ev.code === "KeyM") {
      const muted = this.sfx.toggleMute();
      this.toast(muted ? "muted" : "sound on");
      return;
    }
    if (ev.code === "KeyP") {
      this.togglePause();
      return;
    }
    if (this.engine.state === "gameover") {
      if (ev.code === "KeyR") this.startRun();
      if (ev.code === "Escape") navigate(new LobbyScreen());
      return;
    }
    if (this.disconnectPaused && ev.code === "KeyQ") {
      this.releaseDisconnected();
      return;
    }
    if (ev.code === "Escape") navigate(new LobbyScreen());
  }

  private togglePause(): void {
    // only manual pause/unpause during actual play — never at the ready overlay
    // or while a disconnect is being resolved (review 003 #3)
    if (this.engine.state !== "playing" || this.disconnectPaused) return;
    this.engine.paused = !this.engine.paused;
    const fright = this.engine.frightTicks > 0;
    this.sfx.siren(!this.engine.paused, fright);
    this.toast(this.engine.paused ? "PAUSED" : "");
  }

  private startRun(): void {
    this.sfx.unlock();
    this.disconnectPaused = false;
    this.engine.paused = false;
    this.engine.startRun();
    this.renderer.buildMazeLayer();
    this.hideOverlay();
    this.toast("");
  }

  private showReadyOverlay(): void {
    this.engine.startRun();
    this.engine.paused = true;
    if (!this.overlay || !this.overlayContent) return;
    this.overlay.classList.add("visible");
    this.overlayToast?.replaceChildren();
    const names = this.session.players.map((p) => `P${p.slot + 1} ${p.label}`).join(" · ");
    this.overlayContent.innerHTML = `
      <p class="ready-title">READY?</p>
      <p class="subtitle">${names}</p>
      <p class="subtitle">${this.session.players.length === 1 ? "you steer every direction" : "steer only the arrows you own"}</p>
      <p class="press-start">PRESS ANY DIRECTION TO START</p>
      <p class="subtitle dim">P pause · M mute</p>
    `;
  }

  private hideOverlay(): void {
    if (!this.overlay) return;
    this.overlay.classList.remove("visible", "soft");
    this.overlayContent?.replaceChildren();
    this.overlayToast?.replaceChildren();
  }

  private toast(text: string): void {
    if (!this.overlayToast || !this.overlay) return;
    this.overlayToast.replaceChildren();
    if (!text) {
      if (this.overlayContent?.hasChildNodes()) {
        this.overlay.classList.add("visible");
      } else {
        this.overlay.classList.remove("visible", "soft");
      }
      return;
    }
    this.overlay.classList.add("visible", "soft");
    this.overlayToast.replaceChildren(el("p", "toast", text));
  }

  private handleInputEvent(ev: InputEvent): void {
    if (ev.kind === "disconnect") {
      const player = this.session.markDisconnected(ev.device);
      if (player) {
        this.rebuildStrip();
        if (!this.disconnectPaused) {
          this.disconnectPaused = true;
          this.engine.paused = true;
          this.sfx.siren(false);
        }
        this.showDisconnectOverlay();
      }
      return;
    }
    if (ev.kind === "button") {
      // B (1) on the game-over screen returns pad-only players to the lobby (#8)
      if (ev.button === 1 && this.engine.state === "gameover") navigate(new LobbyScreen());
      return;
    }

    // reconnect: any input from a disconnected player's device revives them (D14)
    const owner = this.session.playerByDevice(ev.device);
    if (owner?.disconnected) {
      this.session.markReconnected(ev.device);
      this.rebuildStrip();
      if (!this.session.players.some((p) => p.disconnected)) {
        this.disconnectPaused = false;
        this.engine.paused = false;
        this.hideOverlay();
        // fresh READY beat rather than unfreezing mid-tick
        this.engine.resetPositions();
        this.engine.state = "ready";
        this.engine.stateTicks = 0;
      } else {
        this.showDisconnectOverlay();
      }
      return;
    }

    // gamepad players can restart from GAME OVER with Start/A (#8)
    if (this.engine.state === "gameover") {
      if (ev.kind === "confirm") this.startRun();
      return;
    }

    // start from the ready overlay
    if (this.engine.paused && !this.disconnectPaused) {
      this.startRun();
    }

    if (ev.kind === "confirm") return;
    if (ev.kind !== "dir") return;

    if (this.engine.state !== "playing" && this.engine.state !== "ready") return;

    const player = this.session.playerByDevice(ev.device);
    if (this.session.canSteer(ev.device, ev.dir)) {
      this.sfx.unlock();
      this.engine.pressDirection(ev.dir);
      if (player) this.pulse(player.slot, ev.dir);
      else this.pulseFree(ev.dir); // steering a freed direction (#17)
    } else if (player) {
      this.deny(player.slot);
    }
  }

  private showDisconnectOverlay(): void {
    if (!this.overlay || !this.overlayContent) return;
    const gone = this.session.players.filter((p) => p.disconnected);
    if (gone.length === 0) return;
    this.overlay.classList.add("visible");
    this.overlay.classList.remove("soft");
    this.overlayToast?.replaceChildren();
    const names = gone
      .map((p) => `<span style="color:var(--player-${p.slot + 1})">P${p.slot + 1} ${p.label}</span>`)
      .join("<br />");
    this.overlayContent.innerHTML = `
      <p class="gameover-title">CONTROLLER LOST</p>
      <p class="subtitle">${names}</p>
      <p class="subtitle">reconnect and press anything to resume</p>
      <p class="subtitle dim">or press Q to release their directions to everyone</p>
    `;
  }

  private releaseDisconnected(): void {
    for (const p of this.session.players) {
      if (p.disconnected) this.session.releasePlayerDirections(p);
    }
    this.disconnectPaused = false;
    this.engine.paused = false;
    this.hideOverlay();
    this.rebuildStrip();
  }

  private rebuildStrip(): void {
    if (!this.strip) return;
    this.strip.replaceChildren();
    for (const p of this.session.players) {
      this.strip.appendChild(this.playerChip(p));
    }
    this.strip.appendChild(this.freedChip());
  }

  private playerChip(p: (typeof this.session.players)[number]): HTMLElement {
    const chip = el("div", `strip-chip ${p.disconnected ? "gone" : ""}`);
    chip.dataset.slot = String(p.slot);
    chip.style.setProperty("--pc", p.color);
    chip.innerHTML = `
      <span class="chip-name">P${p.slot + 1}</span>
      <span class="chip-dirs">${DIRECTIONS.map(
        (d) =>
          `<span class="dir-pip ${p.directions.has(d) ? "own" : ""}" data-dir="${d}">${DIR_GLYPH[d]}</span>`,
      ).join("")}</span>`;
    return chip;
  }

  private freedChip(): HTMLElement {
    const chip = el("div", "strip-chip freed");
    const freed = this.session.freeDirections;
    chip.innerHTML = `<span class="chip-name">FREE</span>
      <span class="chip-dirs">${DIRECTIONS.map((d) =>
        freed.has(d)
          ? `<span class="dir-pip own" data-dir="${d}">${DIR_GLYPH[d]}</span>`
          : "",
      ).join("")}</span>`;
    return chip;
  }

  private pulse(slot: number, dir: Direction): void {
    const chip = slot >= 0 ? this.strip?.querySelector<HTMLElement>(`.strip-chip[data-slot="${slot}"]`) : null;
    const pip = chip?.querySelector<HTMLElement>(`.dir-pip[data-dir="${dir}"]`);
    if (!pip) return;
    pip.classList.remove("pulse");
    void pip.offsetWidth; // restart animation
    pip.classList.add("pulse");
  }

  private pulseFree(dir: Direction): void {
    const pip = this.strip?.querySelector<HTMLElement>(
      `.strip-chip.freed .dir-pip[data-dir="${dir}"]`,
    );
    if (!pip) return;
    pip.classList.remove("pulse");
    void pip.offsetWidth;
    pip.classList.add("pulse");
  }

  private deny(slot: number): void {
    const chip = this.strip?.querySelector<HTMLElement>(`.strip-chip[data-slot="${slot}"]`);
    if (!chip) return;
    chip.classList.remove("deny");
    void chip.offsetWidth;
    chip.classList.add("deny");
  }

  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(100, now - this.lastTime);
    this.lastTime = now;
    this.accumulator += dt;

    for (const ev of this.input.poll()) this.handleInputEvent(ev);

    const stepMs = 1000 / 60;
    let steps = 0;
    while (this.accumulator >= stepMs && steps < 6) {
      const prevState = this.engine.state;
      this.engine.tick();
      if (prevState !== this.engine.state) this.onStateChange(prevState, this.engine.state);
      this.accumulator -= stepMs;
      steps++;
    }
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
    if (e.state === "gameover" && !this.overlayContent?.hasChildNodes()) {
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
      el("p", "subtitle", "R restart · ESC lobby"),
    );
  }
}
