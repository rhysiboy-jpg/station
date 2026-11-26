import type { ModuleTypeId } from "./content";
import type { GridCell, Rotation } from "./geometry";
import { checkPlacement, connectedToCore } from "./placement";
import type { ModuleId, PlacedModule, Station } from "./station";

export type Command =
  | { type: "place"; module: ModuleTypeId; position: GridCell; rotation: Rotation }
  | { type: "remove"; moduleId: ModuleId }
  | { type: "undo" };

export type RejectionReason =
  | "overlaps"
  | "not-connected"
  | "would-split"
  | "core-node"
  | "no-such-module"
  | "nothing-to-undo";

export type CommandResult =
  | { ok: true; station: Station }
  | { ok: false; reason: RejectionReason; message: string };

/** Applies a player command. Returns the new station, or why the command was rejected. Never mutates. */
export function applyCommand(station: Station, command: Command): CommandResult {
  switch (command.type) {
    case "place":
      return place(station, command);
    case "remove":
      return remove(station, command.moduleId);
    case "undo":
      return undo(station);
  }
}

function place(station: Station, command: Extract<Command, { type: "place" }>): CommandResult {
  const placement = { type: command.module, position: command.position, rotation: command.rotation };
  const check = checkPlacement(station, placement);
  if (!check.ok) return check;

  const placed: PlacedModule = { id: station.nextModuleId, ...placement };
  return {
    ok: true,
    station: withBuildChange(station, [...station.modules, placed], station.nextModuleId + 1),
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

  const remaining = station.modules.filter((m) => m.id !== moduleId);
  if (connectedToCore(remaining).size !== remaining.length) {
    return {
      ok: false,
      reason: "would-split",
      message: "Removing it would cut other modules off from the station.",
    };
  }
  return { ok: true, station: withBuildChange(station, remaining, station.nextModuleId) };
}

function undo(station: Station): CommandResult {
  const previous = station.history.at(-1);
  if (!previous) {
    return { ok: false, reason: "nothing-to-undo", message: "Nothing to undo." };
  }
  return { ok: true, station: { ...station, modules: previous, history: station.history.slice(0, -1) } };
}

function withBuildChange(station: Station, modules: PlacedModule[], nextModuleId: ModuleId): Station {
  return { ...station, modules, nextModuleId, history: [...station.history, station.modules] };
}
