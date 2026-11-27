// Saves: a station as versioned JSON, and back. Loading checks everything, so
// a broken or hand-edited file is rejected with a clear message rather than
// breaking the game. Undo history isn't saved: undo starts fresh after a load.
import {
  CHALLENGES,
  DIFFICULTIES,
  EQUIPMENT_TYPES,
  MODULE_TYPES,
  type Challenge,
  type ChallengeId,
  type EquipmentTypeId,
  type ModuleTypeId,
} from "./content";
import { hardpointsOf } from "./equipment";
import { footprintOf, type Rotation } from "./geometry";
import { connectedToCore } from "./placement";
import { bedsOf, crewOf, type Air, type ChallengeRun, type PlacedModule, type Station } from "./station";

/**
 * Bump when the format changes, and teach `loadStation` to upgrade older files.
 * 1: first format. 2: adds `challenge` (version 1 files load in free play).
 */
export const SAVE_VERSION = 2;
const GAME = "orbitwright";

type SavedStation = Omit<Station, "history">;

export function saveStation(station: Station): string {
  const { history: _history, ...state } = station;
  const saved: SavedStation = state;
  return JSON.stringify({ game: GAME, version: SAVE_VERSION, station: saved }, null, 1);
}

export type LoadResult = { ok: true; station: Station } | { ok: false; message: string };

export function loadStation(text: string): LoadResult {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return { ok: false, message: "That isn't a station file: it couldn't be read as JSON." };
  }
  try {
    return { ok: true, station: readFile(file) };
  } catch (error) {
    if (error instanceof SaveError) return { ok: false, message: error.message };
    throw error;
  }
}

class SaveError extends Error {}

function fail(message: string): never {
  throw new SaveError(message);
}

function readFile(file: unknown): Station {
  const top = object(file, "file");
  if (top.game !== GAME) fail("That isn't a station file from this game.");
  const version = top.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) fail("That isn't a station file: it has no version.");
  if (version > SAVE_VERSION) fail("That file comes from a newer version of the game. Reload the page to update, then try again.");
  const s = object(top.station, "station");

  const modules = array(s.modules, "modules").map((m, i) => readModule(m, i));
  const station: Station = {
    orbit: s.orbit === "LEO" ? "LEO" : fail("The station's orbit isn't one the game knows."),
    tick: wholeNumber(s.tick, "tick"),
    modules,
    nextModuleId: wholeNumber(s.nextModuleId, "nextModuleId"),
    batteries: record(s.batteries, "batteries", (v, k) => amount(v, `batteries.${k}`)),
    powerRunningUpTo: record(s.powerRunningUpTo, "powerRunningUpTo", (v, k) => tier(v, `powerRunningUpTo.${k}`)),
    air: record(s.air, "air", (v, k) => readAir(v, `air.${k}`)),
    water: record(s.water, "water", (v, k) => amount(v, `water.${k}`)),
    temperature: record(s.temperature, "temperature", (v, k) => finite(v, `temperature.${k}`)),
    redTicks: record(s.redTicks, "redTicks", (v, k) => wholeNumber(v, `redTicks.${k}`)),
    offline: array(s.offline, "offline").map((v, i) => wholeNumber(v, `offline.${i}`)),
    abandoned: boolean(s.abandoned, "abandoned"),
    abandonedBecause:
      s.abandonedBecause === null ||
      s.abandonedBecause === "temperature" ||
      s.abandonedBecause === "o2" ||
      s.abandonedBecause === "co2" ||
      s.abandonedBecause === "water"
        ? s.abandonedBecause
        : fail("Part of the save is broken: abandonedBecause isn't valid."),
    difficulty:
      typeof s.difficulty === "string" && s.difficulty in DIFFICULTIES
        ? (s.difficulty as Station["difficulty"])
        : fail("Part of the save is broken: its difficulty isn't one the game knows."),
    data: record(s.data, "data", (v, k) => amount(v, `data.${k}`)),
    downlinked: amount(s.downlinked, "downlinked"),
    dataLost: amount(s.dataLost, "dataLost"),
    // Version 1 files predate challenges.
    challenge: version < 2 ? null : readChallenge(s.challenge),
    history: [],
  };
  checkLayout(station);
  return station;
}

function readModule(value: unknown, index: number): PlacedModule {
  const m = object(value, `modules.${index}`);
  const type = m.type;
  if (typeof type !== "string" || !(type in MODULE_TYPES)) fail(`Module ${index + 1} has a module type the game doesn't know.`);
  const moduleType = MODULE_TYPES[type as ModuleTypeId];
  const position = object(m.position, `modules.${index}.position`);
  const rotation = m.rotation;
  if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) fail(`Module ${index + 1} has a rotation that isn't a quarter turn.`);
  const mounts = (key: "slots" | "hardpoints", count: number, mount: "internal" | "external") => {
    const list = array(m[key], `modules.${index}.${key}`);
    if (list.length !== count) fail(`Module ${index + 1} should have ${count} ${key}, not ${list.length}.`);
    return list.map((e) => {
      if (e === null) return null;
      if (typeof e !== "string" || !(e in EQUIPMENT_TYPES)) fail(`Module ${index + 1} holds equipment the game doesn't know.`);
      const equipment = EQUIPMENT_TYPES[e as EquipmentTypeId];
      if (equipment.mount !== mount) {
        fail(`Module ${index + 1}: ${equipment.name} ${equipment.mount === "external" ? "goes on a hardpoint" : "goes in a slot"}.`);
      }
      return e as EquipmentTypeId;
    });
  };
  return {
    id: wholeNumber(m.id, `modules.${index}.id`),
    type: type as ModuleTypeId,
    position: { x: integer(position.x, `modules.${index}.position.x`), y: integer(position.y, `modules.${index}.position.y`) },
    rotation: rotation as Rotation,
    slots: mounts("slots", moduleType.slots, "internal"),
    hardpoints: mounts("hardpoints", moduleType.hardpoints.length, "external"),
    crew: wholeNumber(m.crew, `modules.${index}.crew`),
  };
}

/** The layout must be one the game itself would have let you build. */
function checkLayout(station: Station): void {
  const { modules } = station;
  if (modules[0]?.type !== "core-node") fail("The station doesn't start from a core node.");
  const ids = new Set(modules.map((m) => m.id));
  if (ids.size !== modules.length) fail("Two modules share an id.");
  if (modules.some((m) => m.id >= station.nextModuleId)) fail("Part of the save is broken: nextModuleId is too low.");

  const cells = new Set<string>();
  for (const m of modules) {
    for (const c of footprintOf(m)) {
      const key = `${c.x},${c.y}`;
      if (cells.has(key)) fail("Two modules overlap.");
      cells.add(key);
    }
  }
  if (connectedToCore(modules).size !== modules.length) fail("Not every module is connected to the station.");

  for (const m of modules) {
    if (hardpointsOf(station, m).some((h) => h.blocked && h.equipment)) fail("Equipment sits on a blocked hardpoint.");
    if (m.crew > 0 && !MODULE_TYPES[m.type].pressurised) fail("Crew are aboard an unpressurised module.");
  }
  if (crewOf(modules) > bedsOf(modules)) fail("There are more crew than beds.");
}

// Small readers that name the field they reject.

function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`Part of the save is broken: ${field} is missing.`);
  return value as Record<string, unknown>;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) fail(`Part of the save is broken: ${field} is missing.`);
  return value;
}

function record<T>(value: unknown, field: string, read: (v: unknown, key: string) => T): Record<string, T> {
  const o = object(value, field);
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, read(v, k)]));
}

function finite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`Part of the save is broken: ${field} isn't a number.`);
  return value;
}

function amount(value: unknown, field: string): number {
  const n = finite(value, field);
  if (n < 0) fail(`Part of the save is broken: ${field} is below zero.`);
  return n;
}

function integer(value: unknown, field: string): number {
  const n = finite(value, field);
  if (!Number.isInteger(n)) fail(`Part of the save is broken: ${field} isn't a whole number.`);
  return n;
}

function wholeNumber(value: unknown, field: string): number {
  const n = integer(value, field);
  if (n < 0) fail(`Part of the save is broken: ${field} is below zero.`);
  return n;
}

function tier(value: unknown, field: string): number {
  const n = wholeNumber(value, field);
  if (n > 4) fail(`Part of the save is broken: ${field} isn't a priority tier.`);
  return n;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") fail(`Part of the save is broken: ${field} isn't true or false.`);
  return value;
}

function readChallenge(value: unknown): ChallengeRun | null {
  if (value === null) return null;
  const c = object(value, "challenge");
  const id = c.id;
  if (typeof id !== "string" || !CHALLENGES.some((known) => known.id === id)) fail("The save's challenge isn't one the game knows.");
  const outcome = c.outcome;
  if (outcome !== "running" && outcome !== "won" && outcome !== "failed") fail("Part of the save is broken: challenge.outcome isn't valid.");
  const holds = (CHALLENGES.find((known) => known.id === id) as Challenge).holds.length;
  const lapses = array(c.lapses, "challenge.lapses").map((v, i) => wholeNumber(v, `challenge.lapses.${i}`));
  if (lapses.length !== holds) fail("Part of the save is broken: challenge.lapses doesn't match the challenge.");
  return {
    id: id as ChallengeId,
    startTick: wholeNumber(c.startTick, "challenge.startTick"),
    downlinkedAtStart: amount(c.downlinkedAtStart, "challenge.downlinkedAtStart"),
    lapses,
    outcome,
    endedTick: c.endedTick === null ? null : wholeNumber(c.endedTick, "challenge.endedTick"),
    failedBecause:
      c.failedBecause === null || typeof c.failedBecause === "string"
        ? c.failedBecause
        : fail("Part of the save is broken: challenge.failedBecause isn't text."),
  };
}

function readAir(value: unknown, field: string): Air {
  const a = object(value, field);
  return { o2: amount(a.o2, `${field}.o2`), co2: amount(a.co2, `${field}.co2`) };
}
