/** Retro SFX synthesized with WebAudio — no assets (D3). */
import type { GameEvent } from "../game/engine";

export class Sfx {
  private ctx: AudioContext | undefined;
  private master: GainNode | undefined;
  private sirenOsc: OscillatorNode | undefined;
  private sirenGain: GainNode | undefined;
  private sirenLfo: OscillatorNode | undefined;
  private sirenFright = false;
  private chompHi = false;
  muted = false;

  /** Must be called from a user gesture at least once (autoplay policy). */
  unlock(): void {
    this.ensure();
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  private ensure(): AudioContext | undefined {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = undefined;
    }
    return this.ctx;
  }

  private blip(
    freq0: number,
    freq1: number,
    durSec: number,
    type: OscillatorType,
    vol = 0.5,
    delaySec = 0,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted) return;
    const t0 = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq0, t0);
    if (freq1 !== freq0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), t0 + durSec);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + durSec);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + durSec + 0.02);
  }

  chomp(): void {
    // alternating "wa"/"ka"
    this.chompHi = !this.chompHi;
    this.blip(this.chompHi ? 550 : 420, this.chompHi ? 300 : 210, 0.07, "square", 0.25);
  }

  energizer(): void {
    this.blip(160, 320, 0.25, "triangle", 0.5);
  }

  eatGhost(): void {
    this.blip(200, 900, 0.22, "square", 0.5);
  }

  fruit(): void {
    this.blip(700, 700, 0.08, "square", 0.45);
    this.blip(1050, 1050, 0.1, "square", 0.45, 0.09);
  }

  extraLife(): void {
    for (const [i, f] of [660, 880, 1320].entries()) {
      this.blip(f, f, 0.09, "square", 0.4, i * 0.1);
    }
  }

  levelClear(): void {
    for (const [i, f] of [523, 659, 784, 1046].entries()) {
      this.blip(f, f, 0.1, "triangle", 0.45, i * 0.09);
    }
  }

  death(): void {
    this.blip(640, 70, 0.8, "sawtooth", 0.5, 0.35);
    this.blip(320, 60, 0.5, "square", 0.25, 0.9);
  }

  /** Background siren: normal rising hum or frightened wobble. */
  siren(on: boolean, fright = false): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (on && fright !== this.sirenFright) this.stopSiren();
    if (on && this.sirenOsc) return;
    if (!on) {
      this.stopSiren();
      return;
    }
    this.sirenFright = fright;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    osc.type = fright ? "square" : "sawtooth";
    osc.frequency.value = fright ? 240 : 380;
    lfo.frequency.value = fright ? 4 : 6;
    lfoGain.gain.value = fright ? 60 : 90;
    lfo.connect(lfoGain).connect(osc.frequency);
    gain.gain.value = 0.035;
    osc.connect(gain).connect(this.master);
    osc.start();
    lfo.start();
    this.sirenOsc = osc;
    this.sirenGain = gain;
    this.sirenLfo = lfo;
  }

  private stopSiren(): void {
    try {
      this.sirenOsc?.stop();
      this.sirenLfo?.stop();
      this.sirenGain?.disconnect();
    } catch {
      /* already stopped */
    }
    this.sirenOsc = undefined;
    this.sirenGain = undefined;
    this.sirenLfo = undefined;
  }

  /** Dispatch an engine event to sound. */
  handleEvent(ev: GameEvent): void {
    switch (ev.type) {
      case "dot":
        this.chomp();
        break;
      case "energizer":
        this.energizer();
        break;
      case "frightStart":
        if (ev.seconds > 0) this.siren(true, true);
        break;
      case "frightEnd":
        this.siren(true, false);
        break;      case "eatGhost":
        this.eatGhost();
        break;
      case "fruit":
        this.fruit();
        break;
      case "extraLife":
        this.extraLife();
        break;
      case "death":
        this.stopSiren();
        this.death();
        break;
      case "levelClear":
        this.stopSiren();
        this.levelClear();
        break;
      case "gameOver":
        this.stopSiren();
        break;
    }
  }
}
