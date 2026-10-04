import type { UIScreen } from "../ui/screen";
import type { HealthResponse } from "../../shared/api";
import { escapeHtml } from "../ui/dom";

/**
 * Placeholder home screen for feature 001 — verifies the shell + server wiring.
 * Replaced by the attract screen in feature 002.
 */
export class HomeScreen implements UIScreen {
  mount(root: HTMLElement): void {
    const el = document.createElement("div");
    el.className = "screen";
    el.innerHTML = `
      <h1 class="logo">PACMAN<span class="together">TOGETHER</span></h1>
      <p class="subtitle">
        up to 4 players steer one pacman<br />
        each player owns a direction
      </p>
      <div class="panel">
        <span class="chip" data-state="load"><span class="dot"></span><span class="label">connecting…</span></span>
      </div>
      <p class="subtitle">game arrives in feature 002 — shell &amp; server online</p>
    `;
    root.appendChild(el);

    const chip = el.querySelector<HTMLElement>(".chip");
    const label = el.querySelector<HTMLElement>(".chip .label");
    if (!chip || !label) return;

    fetch("/api/health")
      .then((res) => {
        if (!res.ok) throw new Error(`health ${res.status}`);
        return res.json() as Promise<HealthResponse>;
      })
      .then((body) => {
        chip.dataset.state = body.status === "ok" ? "ok" : "err";
        label.textContent = `server ${body.status} — v${escapeHtml(body.version)}`;
      })
      .catch(() => {
        chip.dataset.state = "err";
        label.textContent = "server unreachable";
      });
  }
}
