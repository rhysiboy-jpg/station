// Equipment in slots and on hardpoints, and which hardpoints are blocked.
import { EQUIPMENT_TYPES, type EquipmentTypeId } from "./content";
import { facingCell, footprintOf, hardpointPositionsOf, type PlacedPort } from "./geometry";
import type { ModuleId, PlacedModule, Station } from "./station";

export type MountRef = { kind: "slot"; index: number } | { kind: "hardpoint"; index: number };

export interface HardpointState extends PlacedPort {
  index: number;
  equipment: EquipmentTypeId | null;
  /** Another module is attached on this face, so nothing can be fitted here. */
  blocked: boolean;
}

/** Equipment lost because a module was placed over its hardpoint. */
export interface Displaced {
  moduleId: ModuleId;
  equipment: EquipmentTypeId;
}

function occupiedCells(modules: PlacedModule[]): Set<string> {
  return new Set(modules.flatMap((m) => footprintOf(m).map((c) => `${c.x},${c.y}`)));
}

function hardpointStates(module: PlacedModule, occupied: Set<string>): HardpointState[] {
  return hardpointPositionsOf(module).map((position, index) => {
    const facing = facingCell(position);
    return {
      ...position,
      index,
      equipment: module.hardpoints[index] ?? null,
      blocked: occupied.has(`${facing.x},${facing.y}`),
    };
  });
}

/** A module's hardpoints with their equipment and whether each is blocked. */
export function hardpointsOf(station: Station, module: PlacedModule): HardpointState[] {
  return hardpointStates(module, occupiedCells(station.modules));
}

/** Clears equipment from hardpoints that the current layout blocks. */
export function clearBlockedHardpoints(modules: PlacedModule[]): { modules: PlacedModule[]; displaced: Displaced[] } {
  const occupied = occupiedCells(modules);
  const displaced: Displaced[] = [];
  const cleared = modules.map((module) => {
    const states = hardpointStates(module, occupied);
    if (!states.some((h) => h.blocked && h.equipment)) return module;
    return {
      ...module,
      hardpoints: states.map((h) => {
        if (h.blocked && h.equipment) {
          displaced.push({ moduleId: module.id, equipment: h.equipment });
          return null;
        }
        return h.equipment;
      }),
    };
  });
  return { modules: cleared, displaced };
}

export type MountRejection = "no-such-mount" | "wrong-mount" | "occupied" | "blocked" | "empty";

export function fitEquipment(
  station: Station,
  module: PlacedModule,
  mount: MountRef,
  equipment: EquipmentTypeId,
): { ok: true; module: PlacedModule } | { ok: false; reason: MountRejection; message: string } {
  const list = mount.kind === "slot" ? module.slots : module.hardpoints;
  if (mount.index < 0 || mount.index >= list.length) {
    return { ok: false, reason: "no-such-mount", message: `This module has no ${mount.kind} there.` };
  }
  const wanted = mount.kind === "slot" ? "internal" : "external";
  const type = EQUIPMENT_TYPES[equipment];
  if (type.mount !== wanted) {
    return {
      ok: false,
      reason: "wrong-mount",
      message:
        type.mount === "internal"
          ? `${type.name} is internal equipment and goes in a slot.`
          : `${type.name} is external equipment and goes on a hardpoint.`,
    };
  }
  if (list[mount.index]) {
    return { ok: false, reason: "occupied", message: `That ${mount.kind} already holds something.` };
  }
  if (mount.kind === "hardpoint" && hardpointsOf(station, module)[mount.index]?.blocked) {
    return { ok: false, reason: "blocked", message: "That hardpoint is blocked by an attached module." };
  }
  return { ok: true, module: withMount(module, mount, equipment) };
}

export function unfitEquipment(
  module: PlacedModule,
  mount: MountRef,
): { ok: true; module: PlacedModule } | { ok: false; reason: MountRejection; message: string } {
  const list = mount.kind === "slot" ? module.slots : module.hardpoints;
  if (mount.index < 0 || mount.index >= list.length) {
    return { ok: false, reason: "no-such-mount", message: `This module has no ${mount.kind} there.` };
  }
  if (!list[mount.index]) {
    return { ok: false, reason: "empty", message: `That ${mount.kind} is empty.` };
  }
  return { ok: true, module: withMount(module, mount, null) };
}

function withMount(module: PlacedModule, mount: MountRef, equipment: EquipmentTypeId | null): PlacedModule {
  const key = mount.kind === "slot" ? "slots" : "hardpoints";
  const list = [...module[key]];
  list[mount.index] = equipment;
  return { ...module, [key]: list };
}
