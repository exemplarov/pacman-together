import { ScreenManager } from "./screen";

/**
 * App-wide screen navigator singleton. Lives in its own module so screens can
 * import it without circular dependencies on main.ts.
 */
let manager: ScreenManager | undefined;

export function initNavigation(root: HTMLElement): ScreenManager {
  manager = new ScreenManager(root);
  return manager;
}

export function navigate(screen: Parameters<ScreenManager["show"]>[0]): void {
  if (!manager) throw new Error("navigation not initialized (call initNavigation first)");
  manager.show(screen);
}
