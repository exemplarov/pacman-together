/** Session state: joined players, direction ownership, auto-assignment (D2, D13-D15). */
import { DIRECTIONS, type Direction } from "../../shared/directions";
import type { DeviceRef } from "./devices";
import { sameDevice } from "./devices";

export const PLAYER_COLORS = ["#ff4d6d", "#4dc9ff", "#b14dff", "#7dff6d"] as const;

export interface Player {
  slot: number; // join order, 0-based
  color: string;
  device: DeviceRef;
  label: string;
  directions: Set<Direction>;
  disconnected: boolean;
}

export class Session {
  readonly players: Player[] = [];
  /** directions released to everyone (e.g. after a controller loss, D14) */
  readonly freeDirections = new Set<Direction>();

  join(device: DeviceRef, label: string): Player | null {
    if (this.players.length >= 4) return null;
    if (this.playerByDevice(device)) return null;
    const player: Player = {
      slot: this.players.length,
      color: PLAYER_COLORS[this.players.length]!,
      device,
      label,
      directions: new Set(),
      disconnected: false,
    };
    this.players.push(player);
    return player;
  }

  playerByDevice(d: DeviceRef): Player | undefined {
    return this.players.find((p) => sameDevice(p.device, d));
  }

  ownerOf(dir: Direction): Player | undefined {
    return this.players.find((p) => p.directions.has(dir));
  }

  claim(player: Player, dir: Direction): "claimed" | "taken" | "freed" | "blocked" {
    const owner = this.ownerOf(dir);
    if (owner === player) {
      player.directions.delete(dir);
      return "freed";
    }
    if (owner) return "taken";
    // while someone still has no direction, players who already own one must wait
    // (prevents one player from claiming all four and deadlocking the lobby — review 003 #9)
    if (
      player.directions.size > 0 &&
      this.players.some((p) => p !== player && !p.disconnected && p.directions.size === 0)
    ) {
      return "blocked";
    }
    player.directions.add(dir);
    this.freeDirections.delete(dir);
    return "claimed";
  }

  allPlayersHaveDirections(): boolean {
    return this.players.length > 0 && this.players.every((p) => p.directions.size >= 1);
  }

  get unclaimedDirections(): Direction[] {
    return DIRECTIONS.filter(
      (d) => !this.ownerOf(d) && !this.freeDirections.has(d),
    );
  }

  /** Auto-assign leftovers to players with fewest directions; ties → join order (D2). */
  autoAssignLeftovers(): void {
    for (const dir of this.unclaimedDirections) {
      let target: Player | undefined;
      let min = Infinity;
      for (const p of this.players) {
        if (p.disconnected) continue;
        if (p.directions.size < min) {
          min = p.directions.size;
          target = p;
        }
      }
      target?.directions.add(dir);
    }
  }

  /** Solo: one player owns everything. */
  soloAll(): void {
    if (this.players.length !== 1) return;
    for (const d of DIRECTIONS) this.players[0]!.directions.add(d);
  }

  /** A device may steer `dir` iff its player owns it, or the dir is free
   *  (a disconnected device can never steer — review 003 #11). */
  canSteer(device: DeviceRef, dir: Direction): boolean {
    const p = this.playerByDevice(device);
    if (p?.disconnected) return false;
    if (this.freeDirections.has(dir)) return true;
    return !!p && p.directions.has(dir);
  }

  /** Mark a player's device as gone (pause + overlay); directions kept until released. */
  markDisconnected(device: DeviceRef): Player | undefined {
    const p = this.playerByDevice(device);
    if (p) p.disconnected = true;
    return p;
  }

  markReconnected(device: DeviceRef): Player | undefined {
    const p = this.playerByDevice(device);
    if (p) p.disconnected = false;
    return p;
  }

  /** Release a disconnected player's directions to everyone (Q, D14). */
  releasePlayerDirections(player: Player): void {
    for (const d of player.directions) this.freeDirections.add(d);
    player.directions.clear();
    player.disconnected = true;
  }
}
