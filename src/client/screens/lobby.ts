/** Lobby: join devices → claim directions (D2) → summary → launch game. */
import type { UIScreen } from "../ui/screen";
import { navigate } from "../ui/nav";
import { el } from "../ui/dom";
import { DIRECTIONS, type Direction } from "../../shared/directions";
import { InputSystem, deviceLabel, type InputEvent } from "../input/devices";
import { Session, type Player } from "../input/session";
import { GameScreen } from "./game";
import { LeaderboardScreen } from "./leaderboard";
import { apiUpsertUser } from "../ui/api";
import { escapeHtml } from "../ui/dom";

const LAST_NAME_KEY = "pacman-together.lastname";

const DIR_GLYPH: Record<Direction, string> = {
  up: "▲",
  left: "◀",
  down: "▼",
  right: "▶",
};

const PICK_COUNTDOWN_SEC = 20;

export class LobbyScreen implements UIScreen {
  private input = new InputSystem();
  private session = new Session();
  private phase: "lobby" | "pick" | "summary" = "lobby";
  private raf = 0;
  private deadline = 0; // pick countdown (ms timestamp), 0 = not running
  private launched = false; // guards double-launch within one frame (review 003 #2)
  private handedOff = false; // input ownership transferred to GameScreen
  private hintTimer = 0;
  private root?: HTMLElement;
  private pickHint?: HTMLElement;
  private countdownEl?: HTMLElement;
  private onKey = (ev: KeyboardEvent): void => this.handleKey(ev);

  mount(root: HTMLElement): void {
    this.root = root;
    window.addEventListener("keydown", this.onKey);
    this.render();
    this.loop();
  }

  unmount(): void {
    window.removeEventListener("keydown", this.onKey);
    cancelAnimationFrame(this.raf);
    if (this.hintTimer) clearTimeout(this.hintTimer);
    // the game screen takes over the input system on launch — only dispose when
    // we are dying without a hand-off (e.g. navigating to the leaderboard)
    if (!this.handedOff) this.input.dispose();
  }

  private handleKey(ev: KeyboardEvent): void {
    if (ev.repeat) return;
    const target = ev.target as HTMLElement | null;
    if (target?.tagName === "INPUT") return; // typing a name
    if (ev.code === "KeyB") {
      navigate(new LeaderboardScreen());
      return;
    }
    if (ev.code !== "Enter" && ev.code !== "Space") return;
    ev.preventDefault();
    if (this.phase === "lobby" && this.session.players.length >= 1) {
      this.beginPick();
    } else if (this.phase === "pick") {
      if (this.session.allPlayersHaveDirections()) this.finishPick();
    } else if (this.phase === "summary") {
      void this.launch();
    }
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const events = this.input.poll();
    for (const ev of events) this.handleEvent(ev);
    if (this.phase === "pick" && this.deadline > 0) {
      const left = this.deadline - performance.now();
      if (left <= 0) {
        this.finishPick();
      } else if (this.countdownEl) {
        this.countdownEl.textContent = `${Math.ceil(left / 1000)}`;
      }
    }
  };

  private handleEvent(ev: InputEvent): void {
    if (ev.kind === "disconnect") return; // handled during games (D14)
    if (this.launched) return;
    const player = this.session.playerByDevice(ev.device);

    // joining (lobby or pick phase): any key/button on an unjoined device
    if (!player && this.session.players.length < 4) {
      const joined = this.session.join(ev.device, deviceLabel(ev.device));
      if (joined && (this.phase === "lobby" || this.phase === "pick")) {
        this.render();
      }
      return;
    }
    if (!player) return;

    if (this.phase === "lobby") {
      if (ev.kind === "confirm" || ev.kind === "dir") this.beginPick();
      return;
    }

    if (this.phase === "pick") {
      if (ev.kind === "dir") {
        const result = this.session.claim(player, ev.dir);
        this.renderPickFeedback(ev.dir, result, player);
        this.maybeStartCountdown();
      } else if (ev.kind === "confirm") {
        if (this.session.allPlayersHaveDirections()) this.finishPick();
      }
      return;
    }
    if (this.phase === "summary") {
      if (ev.kind === "dir" || ev.kind === "confirm") this.launch();
    }
  }

  // ── phase transitions ──

  private beginPick(): void {
    if (this.session.players.length === 1) {
      this.session.soloAll();
      this.phase = "summary";
      this.render();
      return;
    }
    this.phase = "pick";
    this.deadline = 0;
    this.render();
  }

  private maybeStartCountdown(): void {
    if (this.deadline > 0) {
      if (this.session.unclaimedDirections.length === 0) this.finishPick();
      return;
    }
    if (
      this.session.allPlayersHaveDirections() &&
      this.session.unclaimedDirections.length === 0
    ) {
      this.finishPick();
      return;
    }
    if (this.session.allPlayersHaveDirections()) {
      this.deadline = performance.now() + PICK_COUNTDOWN_SEC * 1000;
      const bar = this.root?.querySelector<HTMLElement>(".countdown");
      if (bar) bar.classList.add("visible");
    }
  }

  private finishPick(): void {
    this.deadline = 0;
    this.session.autoAssignLeftovers();
    this.phase = "summary";
    this.render();
  }

  private launch(): void {
    if (this.launched) return;
    this.launched = true;
    void this.launchFlow();
  }

  /** Persist names (best effort) then hand the session to the game screen. */
  private async launchFlow(): Promise<void> {
    const inputs = this.root?.querySelectorAll<HTMLInputElement>(".name-input");
    if (inputs) {
      for (const input of inputs) {
        const slot = Number(input.dataset.slot);
        const player = this.session.players[slot];
        if (!player) continue;
        const name = input.value.trim() || `P${slot + 1}`;
        player.name = name;
        if (slot === 0) localStorage.setItem(LAST_NAME_KEY, name);
      }
    }
    // duplicate names (case-insensitive) would upsert to the same user id and
    // the server rejects duplicate players in one game — auto-suffix instead
    const seen = new Set<string>();
    for (const p of this.session.players) {
      let name = p.name;
      let n = 2;
      while (seen.has(name.toLowerCase())) {
        name = `${p.name}-${n++}`;
      }
      p.name = name;
      seen.add(name.toLowerCase());
    }
    await Promise.all(
      this.session.players.map(async (p) => {
        const user = await apiUpsertUser(p.name);
        if (user) {
          p.userId = user.id;
          p.name = user.name;
        }
      }),
    );
    this.handedOff = true;
    navigate(new GameScreen(this.session, this.input));
  }

  // ── rendering ──

  private render(): void {
    if (!this.root) return;
    this.root.replaceChildren();
    if (this.phase === "lobby") this.renderLobby();
    else if (this.phase === "pick") this.renderPick();
    else this.renderSummary();
  }

  private renderLobby(): void {
    const wrap = el("div", "screen lobby");
    wrap.innerHTML = `
      <h1 class="logo">PACMAN<span class="together">TOGETHER</span></h1>
      <p class="subtitle">up to 4 players steer one pacman — each owns a direction</p>
      <div class="join-hint">PRESS ANY KEY ON YOUR DEVICE TO JOIN</div>
      <div class="slots"></div>
      <p class="subtitle dim">keyboard clusters: ARROWS · WASD · IJKL · NUMPAD 8456 — or press any gamepad button</p>
      <div class="lobby-actions">
        <button class="neon-button" data-action="board">LEADERBOARD (B)</button>
        <span class="start-hint ${this.session.players.length ? "" : "off"}">
          ${this.session.players.length ? "SPACE / START — CONTINUE" : "waiting for players…"}
        </span>
      </div>
    `;
    const slots = wrap.querySelector<HTMLElement>(".slots")!;
    for (let i = 0; i < 4; i++) {
      const player = this.session.players[i];
      if (player) slots.appendChild(this.slotCard(player));
      else slots.appendChild(this.slotCard(undefined));
    }
    wrap
      .querySelector<HTMLButtonElement>('[data-action="board"]')!
      .addEventListener("click", () => navigate(new LeaderboardScreen()));
    this.root?.appendChild(wrap);
  }

  private slotCard(player?: Player): HTMLElement {
    const card = el("div", `slot ${player ? "filled" : "empty"}`);
    if (!player) {
      card.innerHTML = `<div class="slot-q">?</div><div class="slot-label">OPEN</div>`;
      return card;
    }
    card.style.setProperty("--pc", player.color);
    const nameField =
      this.phase === "lobby"
        ? `<input class="name-input" data-slot="${player.slot}" maxlength="16"
             value="${player.slot === 0 ? escapeHtml(localStorage.getItem(LAST_NAME_KEY) ?? "") : escapeHtml(player.name)}"
             placeholder="P${player.slot + 1}" />`
        : `<div class="slot-name">${escapeHtml(player.name)}</div>`;
    card.innerHTML = `
      <div class="slot-p">P${player.slot + 1}</div>
      <div class="slot-label">${player.label}</div>
      ${nameField}
      <div class="slot-dirs">${DIRECTIONS.map(
        (d) =>
          `<span data-dir="${d}" class="dir-pip ${player.directions.has(d) ? "own" : ""}">${DIR_GLYPH[d]}</span>`,
      ).join("")}</div>
    `;
    // capture names live — later phase re-renders destroy the inputs (review 004 #2)
    const input = card.querySelector<HTMLInputElement>(".name-input");
    if (input) {
      input.addEventListener("input", () => {
        player.name = input.value.trim() || `P${player.slot + 1}`;
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        }
      });
    }
    return card;
  }

  private renderPick(): void {
    const wrap = el("div", "screen pick");
    wrap.innerHTML = `
      <h1 class="pick-title">CLAIM YOUR DIRECTIONS</h1>
      <p class="subtitle">press a direction on <span class="hl">your own device</span> to claim it<br />
      press again to release · when everyone has one, leftovers auto-assign</p>
      <div class="pick-cross"></div>
      <div class="countdown"><span class="countdown-num">20</span>s until auto-assign</div>
      <div class="pick-hint"></div>
    `;
    const cross = wrap.querySelector<HTMLElement>(".pick-cross")!;
    // layout: up / left right / down
    const cells: (Direction | null)[] = [null, "up", null, "left", null, "right", null, "down", null];
    for (const cell of cells) {
      if (!cell) {
        cross.appendChild(el("div", "cross-spacer"));
        continue;
      }
      cross.appendChild(this.dirCard(cell));
    }
    const players = el("div", "pick-players");
    for (const p of this.session.players) players.appendChild(this.slotCard(p));
    wrap.appendChild(players);
    this.pickHint = wrap.querySelector<HTMLElement>(".pick-hint") ?? undefined;
    this.countdownEl = wrap.querySelector<HTMLElement>(".countdown-num") ?? undefined;
    const bar = wrap.querySelector<HTMLElement>(".countdown");
    if (this.deadline > 0) bar?.classList.add("visible");
    this.root!.appendChild(wrap);
    this.updateHint();
  }

  private dirCard(dir: Direction): HTMLElement {
    const owner = this.session.ownerOf(dir);
    const card = el("div", `dir-card ${owner ? "owned" : "free"} dir-${dir}`);
    card.dataset.dir = dir;
    if (owner) {
      card.style.setProperty("--pc", owner.color);
      card.innerHTML = `<div class="dir-glyph">${DIR_GLYPH[dir]}</div><div class="dir-owner">P${owner.slot + 1}</div>`;
    } else {
      card.innerHTML = `<div class="dir-glyph">${DIR_GLYPH[dir]}</div><div class="dir-owner">FREE</div>`;
    }
    return card;
  }

  private renderPickFeedback(
    dir: Direction,
    result: "claimed" | "taken" | "freed" | "blocked",
    player: Player,
  ): void {
    const card = this.root?.querySelector<HTMLElement>(`.dir-card[data-dir="${dir}"]`);
    if (card) {
      // re-render the card contents
      const fresh = this.dirCard(dir);
      card.replaceWith(fresh);
      if (result === "taken") {
        fresh.classList.add("shake");
        setTimeout(() => fresh.classList.remove("shake"), 350);
      }
    }
    // refresh player chips
    const players = this.root?.querySelector<HTMLElement>(".pick-players");
    if (players) {
      players.replaceChildren();
      for (const p of this.session.players) players.appendChild(this.slotCard(p));
    }
    if (this.pickHint) {
      const owner = this.session.ownerOf(dir);
      if (result === "taken") {
        this.pickHint.textContent = `${DIR_GLYPH[dir]} is taken by P${owner ? owner.slot + 1 : "?"}`;
        this.pickHint.classList.add("warn");
      } else if (result === "blocked") {
        const needy = this.session.players.find((p) => p.directions.size === 0);
        this.pickHint.textContent = `let P${needy ? needy.slot + 1 : "?"} claim a direction first`;
        this.pickHint.classList.add("warn");
      } else if (result === "freed") {
        this.pickHint.textContent = `P${player.slot + 1} released ${DIR_GLYPH[dir]}`;
        this.pickHint.classList.remove("warn");
      } else {
        this.pickHint.textContent = `P${player.slot + 1} claimed ${DIR_GLYPH[dir]}`;
        this.pickHint.classList.remove("warn");
      }
      // keep the action message visible briefly, then fall back to the waiting list
      if (this.hintTimer) clearTimeout(this.hintTimer);
      this.hintTimer = setTimeout(() => {
        this.updateHint(true);
        this.hintTimer = 0;
      }, 1500) as unknown as number;
    }
  }

  private updateHint(force = false): void {
    if (!this.pickHint || this.phase !== "pick") return;
    if (this.hintTimer && !force) return; // action message still showing
    const waiting = this.session.players.filter((p) => p.directions.size === 0);
    if (waiting.length > 0) {
      this.pickHint.classList.remove("warn");
      this.pickHint.textContent = `waiting: ${waiting
        .map((p) => `P${p.slot + 1} (${p.label})`)
        .join(" · ")}`;
    }
  }

  private renderSummary(): void {
    const wrap = el("div", "screen summary");
    const solo = this.session.players.length === 1;
    wrap.innerHTML = `
      <h1 class="pick-title">${solo ? "SOLO RUN" : "TEAM SETUP"}</h1>
      <div class="slots"></div>
      <p class="subtitle">${solo ? "you steer every direction" : "one pacman · four hands"}</p>
      <div class="press-start">PRESS ANY DIRECTION TO LAUNCH</div>
      <p class="subtitle dim">SPACE also works</p>
    `;
    const slots = wrap.querySelector<HTMLElement>(".slots")!;
    for (const p of this.session.players) {
      const card = this.slotCard(p);
      // mark owned pips
      card.classList.add("summary");
      slots.appendChild(card);
    }
    this.root!.appendChild(wrap);
  }
}
