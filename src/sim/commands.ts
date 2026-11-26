import { MODULE_TYPES, type Difficulty, type EquipmentTypeId, type ModuleTypeId } from "./content";
import {
  clearBlockedHardpoints,
  fitEquipment,
  unfitEquipment,
  type Displaced,
  type MountRef,
  type MountRejection,
} from "./equipment";
import type { GridCell, Rotation } from "./geometry";
import { checkPlacement, connectedToCore } from "./placement";
import { bedsOf, crewOf, isOffline, newModule, type ModuleId, type PlacedModule, type Station } from "./station";

export type Command =
  | { type: "place"; module: ModuleTypeId; position: GridCell; rotation: Rotation }
  | { type: "remove"; moduleId: ModuleId }
  | { type: "fit"; moduleId: ModuleId; mount: MountRef; equipment: EquipmentTypeId }
  | { type: "unfit"; moduleId: ModuleId; mount: MountRef }
  /** Assign this many crew to a module. */
  | { type: "crew"; moduleId: ModuleId; headcount: number }
  /** A station setting, not a build change: it isn't undone by undo. */
  | { type: "difficulty"; difficulty: Difficulty }
  | { type: "undo" };

export type RejectionReason =
  | "overlaps"
  | "not-connected"
  | "would-split"
  | "core-node"
  | "no-such-module"
  | "nothing-to-undo"
  | "crew-aboard"
  | "no-beds"
  | "unpressurised"
  | "bad-headcount"
  | "offline"
  | MountRejection;

export type CommandResult =
  | {
      ok: true;
      station: Station;
      /** Equipment knocked off hardpoints that this command blocked. */
      displaced: Displaced[];
    }
  | { ok: false; reason: RejectionReason; message: string };

/** Applies a player command. Returns the new station, or why the command was rejected. Never mutates. */
export function applyCommand(station: Station, command: Command): CommandResult {
  switch (command.type) {
    case "place":
      return place(station, command);
    case "remove":
      return remove(station, command.moduleId);
    case "fit":
    case "unfit":
      return changeEquipment(station, command);
    case "crew":
      return assignCrew(station, command);
    case "difficulty":
      return { ok: true, station: { ...station, difficulty: command.difficulty }, displaced: [] };
    case "undo":
      return undo(station);
  }
}

function place(station: Station, command: Extract<Command, { type: "place" }>): CommandResult {
  const placement = { type: command.module, position: command.position, rotation: command.rotation };
  const check = checkPlacement(station, placement);
  if (!check.ok) return check;

  const placed = newModule(station.nextModuleId, placement);
  const { modules, displaced } = clearBlockedHardpoints([...station.modules, placed]);
  return {
    ok: true,
    station: withBuildChange(station, modules, station.nextModuleId + 1),
    displaced,
  };
}

function remove(station: Station, moduleId: ModuleId): CommandResult {
  const index = station.modules.findIndex((m) => m.id === moduleId);
  if (index === -1) {
    return { ok: false, reason: "no-such-module", message: "There is no module there." };
  }
  if (index === 0) {
    return { ok: false, reason: "core-node", message: "The core node is the seed of the station and can't be removed." };
  }

  if ((station.modules[index]?.crew ?? 0) > 0) {
    return { ok: false, reason: "crew-aboard", message: "Move its crew out before removing it." };
  }
  const remaining = station.modules.filter((m) => m.id !== moduleId);
  if (crewOf(remaining) > bedsOf(remaining)) {
    return { ok: false, reason: "no-beds", message: "The crew would have nowhere to sleep. Reduce the headcount first." };
  }
  if (connectedToCore(remaining).size !== remaining.length) {
    return {
      ok: false,
      reason: "would-split",
      message: "Removing it would cut other modules off from the station.",
    };
  }
  return { ok: true, station: withBuildChange(station, remaining, station.nextModuleId), displaced: [] };
}

function undo(station: Station): CommandResult {
  const previous = station.history.at(-1);
  if (!previous) {
    return { ok: false, reason: "nothing-to-undo", message: "Nothing to undo." };
  }
  return {
    ok: true,
    station: { ...station, modules: previous, history: station.history.slice(0, -1) },
    displaced: [],
  };
}

function changeEquipment(
  station: Station,
  command: Extract<Command, { type: "fit" | "unfit" }>,
): CommandResult {
  const module = station.modules.find((m) => m.id === command.moduleId);
  if (!module) {
    return { ok: false, reason: "no-such-module", message: "There is no module there." };
  }
  const result =
    command.type === "fit"
      ? fitEquipment(station, module, command.mount, command.equipment)
      : unfitEquipment(module, command.mount);
  if (!result.ok) return result;

  const modules = station.modules.map((m) => (m.id === module.id ? result.module : m));
  return { ok: true, station: withBuildChange(station, modules, station.nextModuleId), displaced: [] };
}

function assignCrew(station: Station, command: Extract<Command, { type: "crew" }>): CommandResult {
  const module = station.modules.find((m) => m.id === command.moduleId);
  if (!module) {
    return { ok: false, reason: "no-such-module", message: "There is no module there." };
  }
  if (!Number.isInteger(command.headcount) || command.headcount < 0) {
    return { ok: false, reason: "bad-headcount", message: "Headcount must be a whole number, zero or more." };
  }
  if (command.headcount > module.crew && isOffline(station, module.id)) {
    return { ok: false, reason: "offline", message: "It's offline. Crew can't go back in until it recovers." };
  }
  if (command.headcount > 0 && !MODULE_TYPES[module.type].pressurised) {
    return { ok: false, reason: "unpressurised", message: "Crew can only work in pressurised modules." };
  }
  const modules = station.modules.map((m) => (m.id === module.id ? { ...m, crew: command.headcount } : m));
  if (crewOf(modules) > bedsOf(modules)) {
    const beds = bedsOf(modules);
    return {
      ok: false,
      reason: "no-beds",
      message: beds === 0 ? "Build a habitat first: crew need somewhere to sleep." : `The station's habitats sleep ${beds}.`,
    };
  }
  return { ok: true, station: withBuildChange(station, modules, station.nextModuleId), displaced: [] };
}

function withBuildChange(station: Station, modules: PlacedModule[], nextModuleId: ModuleId): Station {
  return { ...station, modules, nextModuleId, history: [...station.history, station.modules] };
}
