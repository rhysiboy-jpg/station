// Warnings, failure and recovery: each module's readings become yellow and red
// warnings. A module that stays red goes offline, its crew move somewhere fit,
// and it recovers once its readings are back below yellow. If crew must move
// and nowhere fit is reachable, the station is abandoned.
import {
  AIR_LIMITS,
  MODULE_TYPES,
  NOMINAL_TEMPERATURE,
  OFFLINE_AFTER_TICKS,
  TEMPERATURE_LIMITS,
  WATER_LOW_FRACTION,
} from "./content";
import { lifeSupportOf, type LifeSupportReport } from "./lifeSupport";
import { connectionsOf } from "./placement";
import { powerOf, type PowerReport } from "./power";
import { isOffline, offlineCutsNetworks, type ModuleId, type PlacedModule, type Station } from "./station";

export type Level = "ok" | "yellow" | "red";

/** What a warning is about. Power warns but never takes a module offline on its own. */
export type Condition = "temperature" | "o2" | "co2" | "water" | "power";

export interface Warning {
  moduleId: ModuleId;
  condition: Condition;
  level: Exclude<Level, "ok">;
  /** The reading: °C, kPa, kg of water on its network, or 0 for power. */
  value: number;
}

export interface ModuleStatus {
  /** Its worst warning. */
  level: Level;
  warnings: Warning[];
  offline: boolean;
  /** Ticks left before it goes offline, while counting down in red; otherwise null. */
  ticksToOffline: number | null;
}

export interface FailureReport {
  modules: Record<ModuleId, ModuleStatus>;
  /** Every current warning, red first. */
  warnings: Warning[];
  abandoned: boolean;
  abandonedBecause: Station["abandonedBecause"];
}

const RANK: Record<Level, number> = { ok: 0, yellow: 1, red: 2 };

/** The warning level of a reading where going above the limits is the danger. */
export function levelAbove(value: number, limits: { yellow: number; red: number }): Level {
  return value >= limits.red ? "red" : value >= limits.yellow ? "yellow" : "ok";
}

/** The warning level of a reading where falling below the limits is the danger. */
export function levelBelow(value: number, limits: { yellow: number; red: number }): Level {
  return value < limits.red ? "red" : value < limits.yellow ? "yellow" : "ok";
}

interface Readings {
  power: PowerReport;
  life: LifeSupportReport;
}

/**
 * A module's warnings. Air and water are judged as if `crewed` crew were aboard:
 * they only matter to people, so an empty module never counts down on them.
 */
function warningsOf(station: Station, module: PlacedModule, readings: Readings, crewed: boolean): Warning[] {
  const warnings: Warning[] = [];
  const add = (condition: Condition, level: Level, value: number) => {
    if (level !== "ok") warnings.push({ moduleId: module.id, condition, level, value });
  };

  const temperature = station.temperature[module.id] ?? NOMINAL_TEMPERATURE;
  add("temperature", levelAbove(temperature, TEMPERATURE_LIMITS), temperature);

  const air = readings.life.modules[module.id];
  if (air) {
    add("o2", levelBelow(air.o2, AIR_LIMITS.o2), air.o2);
    add("co2", levelAbove(air.co2, AIR_LIMITS.co2), air.co2);
  }

  if (crewed && MODULE_TYPES[module.type].pressurised) {
    const network = readings.life.water.networks.find((n) => n.moduleIds.includes(module.id));
    const stored = network?.stored ?? 0;
    const capacity = network?.capacity ?? 0;
    add("water", stored <= 0 ? "red" : stored < capacity * WATER_LOW_FRACTION ? "yellow" : "ok", stored);
  }

  const power = readings.power.modules[module.id];
  if (power && !power.offline && power.demand > 0) {
    add("power", !power.powered ? "red" : power.draw < power.demand ? "yellow" : "ok", 0);
  }
  return warnings;
}

/** Conditions that count towards going offline: temperature always; air and water only with crew aboard. */
function counts(warning: Warning, crewed: boolean): boolean {
  if (warning.condition === "power") return false;
  if (warning.condition === "temperature") return true;
  return crewed;
}

/** The more serious of two levels. */
export const worseLevel = (a: Level, b: Level): Level => (RANK[b] > RANK[a] ? b : a);

const worst = (warnings: Warning[]): Level =>
  warnings.reduce<Level>((level, w) => (RANK[w.level] > RANK[level] ? w.level : level), "ok");

function readingsOf(station: Station, power?: PowerReport): Readings {
  return { power: power ?? powerOf(station), life: lifeSupportOf(station) };
}

export function failureOf(station: Station, power?: PowerReport): FailureReport {
  const readings = readingsOf(station, power);
  const modules: Record<ModuleId, ModuleStatus> = {};
  for (const m of station.modules) {
    const warnings = warningsOf(station, m, readings, m.crew > 0);
    const red = warnings.some((w) => w.level === "red" && counts(w, m.crew > 0));
    const offline = isOffline(station, m.id);
    modules[m.id] = {
      level: worst(warnings),
      warnings,
      offline,
      ticksToOffline: !offline && red ? OFFLINE_AFTER_TICKS - (station.redTicks[m.id] ?? 0) : null,
    };
  }
  const warnings = Object.values(modules)
    .flatMap((s) => s.warnings)
    .sort((a, b) => RANK[b.level] - RANK[a.level]);
  return { modules, warnings, abandoned: station.abandoned, abandonedBecause: station.abandonedBecause };
}

/** One tick of the failure state machine. Reads the tick's starting state, like every other system. */
export function stepFailure(
  station: Station,
  power: PowerReport,
): Pick<Station, "modules" | "redTicks" | "offline" | "abandoned" | "abandonedBecause"> {
  if (station.abandoned) {
    const { modules, redTicks, offline, abandoned, abandonedBecause } = station;
    return { modules, redTicks, offline, abandoned, abandonedBecause };
  }
  const readings = readingsOf(station, power);
  const redTicks: Record<ModuleId, number> = {};
  const offline = new Set(station.offline);

  for (const m of station.modules) {
    const warnings = warningsOf(station, m, readings, m.crew > 0).filter((w) => counts(w, m.crew > 0));
    if (offline.has(m.id)) {
      // Recovers once every reading that counts is back below yellow. Its crew have left,
      // so in practice that is its temperature.
      if (warnings.length === 0) offline.delete(m.id);
    } else if (warnings.some((w) => w.level === "red")) {
      const ticks = (station.redTicks[m.id] ?? 0) + 1;
      if (ticks >= OFFLINE_AFTER_TICKS) offline.add(m.id);
      else redTicks[m.id] = ticks;
    }
  }

  // Crew leave offline modules for the nearest reachable modules that are fit
  // to hold them, filling each up to its room before trying the next.
  const after = { ...station, offline: [...offline].sort((a, b) => a - b) };
  const crew = new Map(station.modules.map((m) => [m.id, m.crew]));
  const byId = new Map(station.modules.map((m) => [m.id, m]));
  let abandoned = false;
  let abandonedBecause: Station["abandonedBecause"] = null;
  for (const m of station.modules) {
    let leaving = crew.get(m.id) ?? 0;
    if (!offline.has(m.id) || leaving === 0) continue;
    const refuges = fitRefuges(after, m.id, readings);
    for (const refuge of refuges) {
      const room = MODULE_TYPES[(byId.get(refuge) as PlacedModule).type].maxCrew - (crew.get(refuge) ?? 0);
      const moving = Math.min(Math.max(0, room), leaving);
      crew.set(refuge, (crew.get(refuge) ?? 0) + moving);
      leaving -= moving;
      if (leaving === 0) break;
    }
    crew.set(m.id, leaving);
    if (leaving > 0) {
      abandoned = true;
      const cause = warningsOf(station, m, readings, true).find((w) => w.level === "red" && w.condition !== "power");
      // Somewhere fit was reachable but full: the crew left for want of room.
      abandonedBecause = refuges.length > 0 ? "room" : ((cause?.condition as Station["abandonedBecause"]) ?? null);
      break;
    }
  }

  const modules = abandoned
    ? station.modules.map((m) => (m.crew > 0 ? { ...m, crew: 0 } : m))
    : station.modules.map((m) => (crew.get(m.id) === m.crew ? m : { ...m, crew: crew.get(m.id) ?? 0 }));
  return { modules, redTicks: abandoned ? {} : redTicks, offline: after.offline, abandoned, abandonedBecause };
}

/**
 * Every module crew could shelter in, nearest first (by connections through
 * pressurised modules): online, with nothing in red for crew. On hard
 * difficulty the way can't pass through an offline module.
 */
function fitRefuges(station: Station, from: ModuleId, readings: Readings): ModuleId[] {
  const byId = new Map(station.modules.map((m) => [m.id, m]));
  const pressurised = (id: ModuleId) => {
    const m = byId.get(id);
    return m !== undefined && MODULE_TYPES[m.type].pressurised;
  };
  const neighbours = new Map<ModuleId, ModuleId[]>();
  for (const { a, b } of connectionsOf(station)) {
    if (!pressurised(a.moduleId) || !pressurised(b.moduleId)) continue;
    neighbours.set(a.moduleId, [...(neighbours.get(a.moduleId) ?? []), b.moduleId]);
    neighbours.set(b.moduleId, [...(neighbours.get(b.moduleId) ?? []), a.moduleId]);
  }

  const cut = offlineCutsNetworks(station);
  const fit: ModuleId[] = [];
  const seen = new Set([from]);
  let frontier = [from];
  while (frontier.length > 0) {
    const next: ModuleId[] = [];
    for (const id of frontier) {
      for (const n of [...(neighbours.get(id) ?? [])].sort((x, y) => x - y)) {
        if (seen.has(n)) continue;
        seen.add(n);
        const module = byId.get(n) as PlacedModule;
        const unfit = warningsOf(station, module, readings, true).some((w) => w.level === "red" && w.condition !== "power");
        if (!isOffline(station, n) && !unfit) fit.push(n);
        if (!(cut && isOffline(station, n))) next.push(n);
      }
    }
    frontier = next;
  }
  return fit;
}
