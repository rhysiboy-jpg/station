// Power: solar panels make it in Day, batteries store it, everything powered draws it.
// In a shortage, equipment is shed by priority (ADR 0004).
import { BATTERY_FLOORS, EQUIPMENT_TYPES, LOWEST_PRIORITY, MODULE_SYSTEMS_PRIORITY, MODULE_TYPES, type Priority } from "./content";
import { networksOf, type Network } from "./networks";
import type { ModuleId, PlacedModule, Station } from "./station";
import { orbitOf, SECONDS_PER_TICK } from "./time";

const HOURS_PER_TICK = SECONDS_PER_TICK / 3600;
/** Batteries count as full within this much of capacity (kWh), to absorb rounding. */
const FULL_TOLERANCE = 1e-6;

/**
 * Equipment with priority up to this number runs; 0 means nothing does,
 * not even the modules' own systems.
 */
export type RunningUpTo = number;

/** Why a tier is shed, so the player can see the rule at work (ADR 0004). */
export type ShedReason =
  /** Sunlight can't cover it and there is no battery to draw on. */
  | { kind: "no-supply" }
  /** The battery is down to this tier's floor (a fraction of capacity). */
  | { kind: "battery-floor"; floor: number }
  /** There is enough now, but a shed tier only restarts on a full battery or sunlight alone. */
  | { kind: "waiting-for-full-battery" };

/** Shed tiers and why each is off. Running tiers are absent. */
export type ShedTiers = Partial<Record<Priority, ShedReason>>;

export interface ModulePower {
  /** kW made by its solar panels right now. */
  production: number;
  /** kW the module and its equipment would draw with everything running. */
  demand: number;
  /** kW actually drawn: demand less whatever has been shed. */
  draw: number;
  /** kWh in its batteries. */
  stored: number;
  capacity: number;
  /** True while the module's own systems run. False means it is dark. */
  powered: boolean;
  /** Which of its equipment is running, in the module's slot and hardpoint order. Empty mounts are false. */
  running: { slots: boolean[]; hardpoints: boolean[] };
  runningUpTo: RunningUpTo;
  /** Why each shed tier on its network is off. */
  shed: ShedTiers;
}

export interface NetworkPower {
  moduleIds: ModuleId[];
  production: number;
  demand: number;
  draw: number;
  stored: number;
  capacity: number;
  /** Its modules' own systems are running. */
  powered: boolean;
  /** Everything on it is running: nothing is shed. */
  supplied: boolean;
  runningUpTo: RunningUpTo;
  shed: ShedTiers;
}

export interface PowerReport {
  production: number;
  demand: number;
  draw: number;
  /** production - draw, in kW. Negative means batteries are draining. */
  balance: number;
  stored: number;
  capacity: number;
  /** Every network keeps its modules' own systems running. */
  powered: boolean;
  /** Every network runs everything: nothing anywhere is shed. */
  supplied: boolean;
  networks: NetworkPower[];
  modules: Record<ModuleId, ModulePower>;
}

export function batteryKey(moduleId: ModuleId, slot: number): string {
  return `${moduleId}:${slot}`;
}

interface Load {
  priority: number;
  kw: number;
}

interface Pack {
  key: string;
  capacity: number;
  charge: number;
}

function loadsOf(module: PlacedModule): Load[] {
  const equipment = [...module.slots, ...module.hardpoints].flatMap((e) => (e ? [EQUIPMENT_TYPES[e]] : []));
  return [
    { priority: MODULE_SYSTEMS_PRIORITY, kw: MODULE_TYPES[module.type].draw },
    ...equipment.map((e) => ({ priority: e.priority, kw: e.draw })),
  ];
}

function packsOf(station: Station, module: PlacedModule): Pack[] {
  return module.slots.flatMap((equipment, slot) => {
    const capacity = equipment ? (EQUIPMENT_TYPES[equipment] as { storage?: number }).storage : undefined;
    if (!capacity) return [];
    const key = batteryKey(module.id, slot);
    return [{ key, capacity, charge: Math.min(station.batteries[key] ?? 0, capacity) }];
  });
}

function solarOf(module: PlacedModule, sunlit: boolean): number {
  if (!sunlit) return 0;
  return [...module.slots, ...module.hardpoints].reduce(
    (sum, e) => sum + ((e ? (EQUIPMENT_TYPES[e] as { solar?: number }).solar : undefined) ?? 0),
    0,
  );
}

const demandUpTo = (loads: Load[], upTo: RunningUpTo) =>
  loads.reduce((sum, l) => (l.priority <= upTo ? sum + l.kw : sum), 0);

interface Resolved {
  network: Network;
  modules: PlacedModule[];
  production: number;
  demand: number;
  draw: number;
  stored: number;
  capacity: number;
  packs: Pack[];
  runningUpTo: RunningUpTo;
  shed: ShedTiers;
}

/**
 * Decides what runs on one network for the coming tick.
 *
 * Shedding: from what ran last tick, drop the lowest-priority tiers until the
 * rest can be covered for one tick by sunlight plus the charge above the
 * lowest running tier's battery floor.
 * Restarting: a shed tier comes back only once sunlight alone covers it, or
 * the batteries are full and can cover it. That gap stops equipment flickering
 * on and off as a battery gains a little charge.
 */
function resolve(station: Station, network: Network, sunlit: boolean): Resolved {
  const modules = network.moduleIds.map((id) => station.modules.find((m) => m.id === id) as PlacedModule);
  const loads = modules.flatMap(loadsOf);
  const packs = modules.flatMap((m) => packsOf(station, m));
  const production = modules.reduce((sum, m) => sum + solarOf(m, sunlit), 0);
  const stored = packs.reduce((sum, p) => sum + p.charge, 0);
  const capacity = packs.reduce((sum, p) => sum + p.capacity, 0);
  const full = capacity > 0 && stored >= capacity - FULL_TOLERANCE;

  // Sunlight first; any deficit comes from batteries, but only down to the tier's floor.
  const coverable = (upTo: RunningUpTo) => {
    const deficit = (demandUpTo(loads, upTo) - production) * HOURS_PER_TICK;
    return deficit <= 0 || deficit <= stored - BATTERY_FLOORS[upTo as Priority] * capacity;
  };
  const bySunlight = (upTo: RunningUpTo) => demandUpTo(loads, upTo) <= production;

  // A network that just formed, or gained modules, is held to the most shed of its members.
  const previous = Math.min(
    LOWEST_PRIORITY,
    ...network.moduleIds.map((id) => station.powerRunningUpTo[id] ?? LOWEST_PRIORITY),
  );
  let runningUpTo = previous;
  while (runningUpTo > 0 && !coverable(runningUpTo)) runningUpTo--;
  if (runningUpTo === previous) {
    for (let upTo = previous + 1; upTo <= LOWEST_PRIORITY; upTo++) {
      if (bySunlight(upTo) || (full && coverable(upTo))) runningUpTo = upTo;
    }
  }

  const shed: ShedTiers = {};
  for (let tier = runningUpTo + 1; tier <= LOWEST_PRIORITY; tier++) {
    const floor = BATTERY_FLOORS[tier as Priority];
    shed[tier as Priority] = coverable(tier)
      ? { kind: "waiting-for-full-battery" }
      : capacity > 0
        ? { kind: "battery-floor", floor }
        : { kind: "no-supply" };
  }

  return {
    network,
    modules,
    production,
    demand: demandUpTo(loads, LOWEST_PRIORITY),
    draw: demandUpTo(loads, runningUpTo),
    stored,
    capacity,
    packs,
    runningUpTo,
    shed,
  };
}

function modulePower(
  station: Station,
  module: PlacedModule,
  sunlit: boolean,
  runningUpTo: RunningUpTo,
  shed: ShedTiers,
): ModulePower {
  const loads = loadsOf(module);
  const packs = packsOf(station, module);
  const runs = (e: keyof typeof EQUIPMENT_TYPES | null) => e !== null && EQUIPMENT_TYPES[e].priority <= runningUpTo;
  return {
    production: solarOf(module, sunlit),
    demand: demandUpTo(loads, LOWEST_PRIORITY),
    draw: demandUpTo(loads, runningUpTo),
    stored: packs.reduce((sum, p) => sum + p.charge, 0),
    capacity: packs.reduce((sum, p) => sum + p.capacity, 0),
    powered: runningUpTo >= MODULE_SYSTEMS_PRIORITY,
    running: { slots: module.slots.map(runs), hardpoints: module.hardpoints.map(runs) },
    runningUpTo,
    shed,
  };
}

/** Current power figures for the station, each network and each module: what runs this coming tick. */
export function powerOf(station: Station): PowerReport {
  const sunlit = orbitOf(station).phase === "day";
  const modules: Record<ModuleId, ModulePower> = {};
  const networks = networksOf(station, "power").map((network): NetworkPower => {
    const r = resolve(station, network, sunlit);
    for (const m of r.modules) modules[m.id] = modulePower(station, m, sunlit, r.runningUpTo, r.shed);
    return {
      moduleIds: network.moduleIds,
      production: r.production,
      demand: r.demand,
      draw: r.draw,
      stored: r.stored,
      capacity: r.capacity,
      powered: r.runningUpTo >= MODULE_SYSTEMS_PRIORITY,
      supplied: r.runningUpTo >= LOWEST_PRIORITY,
      runningUpTo: r.runningUpTo,
      shed: r.shed,
    };
  });
  const sum = (key: "production" | "demand" | "draw" | "stored" | "capacity") =>
    networks.reduce((total, n) => total + n[key], 0);
  return {
    production: sum("production"),
    demand: sum("demand"),
    draw: sum("draw"),
    balance: sum("production") - sum("draw"),
    stored: sum("stored"),
    capacity: sum("capacity"),
    powered: networks.every((n) => n.powered),
    supplied: networks.every((n) => n.supplied),
    networks,
    modules,
  };
}

/** One tick of power flow on every network: shed equipment draws nothing, batteries take the difference. */
export function stepPower(station: Station): Pick<Station, "batteries" | "powerRunningUpTo"> {
  const sunlit = orbitOf(station).phase === "day";
  const batteries: Record<string, number> = {};
  const powerRunningUpTo: Record<ModuleId, RunningUpTo> = {};

  for (const network of networksOf(station, "power")) {
    const r = resolve(station, network, sunlit);
    let energy = (r.production - r.draw) * HOURS_PER_TICK;
    for (const pack of r.packs) {
      const change = energy >= 0 ? Math.min(energy, pack.capacity - pack.charge) : -Math.min(-energy, pack.charge);
      pack.charge += change;
      energy -= change;
      batteries[pack.key] = pack.charge;
    }
    for (const id of network.moduleIds) powerRunningUpTo[id] = r.runningUpTo;
  }
  return { batteries, powerRunningUpTo };
}
