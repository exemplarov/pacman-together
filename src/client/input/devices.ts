/** Device input: 4 keyboard clusters + gamepads → unified edge events. */
import { DIRECTIONS, type Direction } from "../../shared/directions";

export interface DeviceRef {
  kind: "keys" | "pad";
  index: number;
}

export type InputEvent =
  | { kind: "dir"; device: DeviceRef; dir: Direction }
  | { kind: "confirm"; device: DeviceRef }
  | { kind: "button"; device: DeviceRef; button: number }
  | { kind: "disconnect"; device: DeviceRef; label: string };

export interface KeyCluster {
  label: string;
  codes: Record<Direction, string>;
}

export const KEY_CLUSTERS: readonly KeyCluster[] = [
  {
    label: "ARROWS",
    codes: { up: "ArrowUp", left: "ArrowLeft", down: "ArrowDown", right: "ArrowRight" },
  },
  {
    label: "WASD",
    codes: { up: "KeyW", left: "KeyA", down: "KeyS", right: "KeyD" },
  },
  {
    label: "IJKL",
    codes: { up: "KeyI", left: "KeyJ", down: "KeyK", right: "KeyL" },
  },
  {
    label: "NUMPAD",
    codes: { up: "Numpad8", left: "Numpad4", down: "Numpad5", right: "Numpad6" },
  },
];

const PAD_DIR_BUTTONS: Record<number, Direction> = {
  12: "up",
  13: "down",
  14: "left",
  15: "right",
};
const PAD_CONFIRM_BUTTONS = new Set([0, 9]); // A, Start
const STICK_DEADZONE = 0.5;

interface PadSnapshot {
  buttons: boolean[];
  stickDir: Direction | null;
  label: string;
}

export function deviceLabel(d: DeviceRef): string {
  if (d.kind === "keys") return KEY_CLUSTERS[d.index]?.label ?? `KEYS ${d.index}`;
  return `PAD ${d.index + 1}`;
}

export function sameDevice(a: DeviceRef, b: DeviceRef): boolean {
  return a.kind === b.kind && a.index === b.index;
}

export class InputSystem {
  private downCodes = new Set<string>();
  private prevCodes = new Set<string>();
  private pads = new Map<number, PadSnapshot>();
  private pending: InputEvent[] = [];
  private readonly handlers: { type: string; fn: EventListener }[];

  constructor() {
    const onKeyDown = (ev: Event): void => {
      const e = ev as KeyboardEvent;
      // stop arrows/space from scrolling the page (also on auto-repeat keydowns)
      if (
        e.code.startsWith("Arrow") ||
        e.code === "Space" ||
        e.code.startsWith("Numpad")
      ) {
        e.preventDefault();
      }
      if (e.repeat) return;
      this.downCodes.add(e.code);
    };
    const onKeyUp = (ev: Event): void => {
      this.downCodes.delete((ev as KeyboardEvent).code);
    };
    // a key released while the window is unfocused never fires keyup —
    // clear everything or that direction goes permanently dead (review 003 #5)
    const onBlur = (): void => {
      this.downCodes.clear();
      this.prevCodes.clear();
    };
    // touching gamepad state here ensures browsers surface already-connected pads
    const onPadConnect = (ev: Event): void => void (ev as GamepadEvent).gamepad;
    const onPadDisconnect = (ev: Event): void => {
      const gamepad = (ev as GamepadEvent).gamepad;
      const index = gamepad.index;
      if (this.pads.has(index)) {
        this.pads.delete(index);
        this.pending.push({
          kind: "disconnect",
          device: { kind: "pad", index },
          label: `PAD ${index + 1}`,
        });
      }
    };
    this.handlers = [
      { type: "keydown", fn: onKeyDown },
      { type: "keyup", fn: onKeyUp },
      { type: "blur", fn: onBlur },
      { type: "gamepadconnected", fn: onPadConnect },
      { type: "gamepaddisconnected", fn: onPadDisconnect },
    ];
    for (const h of this.handlers) window.addEventListener(h.type, h.fn);
  }

  /** Remove window listeners — call when the owning screen unmounts for good. */
  dispose(): void {
    for (const h of this.handlers) window.removeEventListener(h.type, h.fn);
  }

  /** Call once per frame; returns edge events since last poll. */
  poll(): InputEvent[] {
    const events = this.pending;
    this.pending = [];

    // keyboard cluster direction edges
    for (let ci = 0; ci < KEY_CLUSTERS.length; ci++) {
      const cluster = KEY_CLUSTERS[ci]!;
      for (const dir of DIRECTIONS) {
        const code = cluster.codes[dir]!;
        if (this.downCodes.has(code) && !this.prevCodes.has(code)) {
          events.push({ kind: "dir", device: { kind: "keys", index: ci }, dir });
        }
      }
    }
    this.prevCodes = new Set(this.downCodes);

    // gamepads
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad) continue;
      const prev = this.pads.get(pad.index);
      const buttons = pad.buttons.map((b) => b.pressed);
      const label = `PAD ${pad.index + 1}`;
      const stickDir = this.stickDirection(pad.axes);
      const snap: PadSnapshot = { buttons, stickDir, label };
      this.pads.set(pad.index, snap);

      const device = { kind: "pad" as const, index: pad.index };
      // d-pad button indices are only guaranteed for standard-mapped pads (#16)
      const std = pad.mapping === "standard";
      const emitButton = (b: number): void => {
        const dir = PAD_DIR_BUTTONS[b];
        if (dir) {
          if (std) events.push({ kind: "dir", device, dir });
          return; // non-standard d-pad indices are unreliable — stick still works
        }
        if (PAD_CONFIRM_BUTTONS.has(b)) {
          events.push({ kind: "confirm", device });
          return;
        }
        events.push({ kind: "button", device, button: b });
      };

      if (!prev) {
        // first sight of this pad: emit edges only for buttons already down so the
        // wake-up press (browsers expose a pad after its first button) joins with
        // one press (review 003 #7)
        for (let b = 0; b < buttons.length; b++) {
          if (buttons[b]) emitButton(b);
        }
        continue;
      }

      for (let b = 0; b < buttons.length; b++) {
        if (buttons[b]! && !prev.buttons[b]) emitButton(b);
      }
      if (stickDir && stickDir !== prev.stickDir) {
        events.push({ kind: "dir", device, dir: stickDir });
      }
    }
    return events;
  }

  private stickDirection(axes: readonly number[]): Direction | null {
    const x = axes[0] ?? 0;
    const y = axes[1] ?? 0;
    if (Math.hypot(x, y) < STICK_DEADZONE) return null;
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? "right" : "left";
    return y > 0 ? "down" : "up";
  }
}
