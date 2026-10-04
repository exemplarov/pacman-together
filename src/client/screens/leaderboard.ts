/** Leaderboard screen — top team runs (D4, D17). */
import type { UIScreen } from "../ui/screen";
import { navigate } from "../ui/nav";
import { el, escapeHtml } from "../ui/dom";
import { apiLeaderboard, currentMode } from "../ui/api";
import { LobbyScreen } from "./lobby";
import type { LeaderboardEntry } from "../../shared/api";

const DIR_GLYPH: Record<string, string> = {
  up: "▲",
  left: "◀",
  down: "▼",
  right: "▶",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export class LeaderboardScreen implements UIScreen {
  private onKey = (ev: KeyboardEvent): void => {
    if (ev.code === "Escape" || ev.code === "KeyB" || ev.code === "Enter") {
      navigate(new LobbyScreen());
    }
  };

  mount(root: HTMLElement): void {
    window.addEventListener("keydown", this.onKey);
    const wrap = el("div", "screen board-screen");
    wrap.innerHTML = `
      <h1 class="pick-title">LEADERBOARD</h1>
      <div class="board-mode chip"><span class="dot"></span><span class="label">checking…</span></div>
      <div class="board-status">loading…</div>
      <button class="neon-button">BACK (ESC)</button>
    `;
    root.appendChild(wrap);
    const status = wrap.querySelector<HTMLElement>(".board-status")!;
    const modeChip = wrap.querySelector<HTMLElement>(".board-mode")!;
    const modeLabel = modeChip.querySelector<HTMLElement>(".label")!;
    void currentMode().then((mode) => {
      modeChip.dataset.state = "ok";
      modeLabel.textContent = mode === "online" ? "server board" : "this browser only";
    });
    wrap
      .querySelector<HTMLButtonElement>(".neon-button")!
      .addEventListener("click", () => navigate(new LobbyScreen()));

    void apiLeaderboard(15).then(async (entries) => {
      // re-read the mode after the fetch — a server failure may have flipped it
      const mode = await currentMode();
      modeChip.dataset.state = "ok";
      modeLabel.textContent = mode === "online" ? "server board" : "this browser only";
      if (!entries || entries.length === 0) {
        status.innerHTML = `<p class="subtitle">no games yet — be the first team on the board!</p>`;
        return;
      }
      status.replaceChildren(this.table(entries));
    });
  }

  unmount(): void {
    window.removeEventListener("keydown", this.onKey);
  }

  private table(entries: LeaderboardEntry[]): HTMLElement {
    const table = el("div", "board-table");
    const medal = (i: number): string => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`);
    const rows = entries
      .map((e, i) => {
        const players = e.players
          .map(
            (p) =>
              `<span class="board-player">${escapeHtml(p.name)} <span class="board-dirs">${p.directions
                .map((d) => DIR_GLYPH[d] ?? "")
                .join("")}</span></span>`,
          )
          .join('<span class="board-sep">+</span>');
        return `
          <div class="board-row ${i < 3 ? "top" : ""}">
            <span class="board-rank">${medal(i)}</span>
            <span class="board-players">${players}</span>
            <span class="board-score">${e.teamScore.toLocaleString()}</span>
            <span class="board-level">L${e.level}</span>
            <span class="board-date">${formatDate(e.createdAt)}</span>
          </div>`;
      })
      .join("");
    table.innerHTML = `
      <div class="board-row head">
        <span class="board-rank">#</span>
        <span class="board-players">TEAM</span>
        <span class="board-score">SCORE</span>
        <span class="board-level">LVL</span>
        <span class="board-date">DATE</span>
      </div>
      ${rows}
    `;
    return table;
  }
}
