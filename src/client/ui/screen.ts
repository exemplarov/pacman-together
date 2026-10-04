/** A full-screen UI state (attract, lobby, pick, game, leaderboard…). */
export interface UIScreen {
  /** Build and attach this screen's DOM to the given root. */
  mount(root: HTMLElement): void;
  /** Optional cleanup (listeners, rAF, audio…). */
  unmount?(): void;
}

/** Minimal screen switcher: unmounts the current screen, mounts the next. */
export class ScreenManager {
  private current: UIScreen | undefined;

  constructor(private readonly root: HTMLElement) {}

  show(screen: UIScreen): void {
    this.current?.unmount?.();
    this.root.replaceChildren();
    this.current = screen;
    screen.mount(this.root);
  }
}
