// Power: solar panels make it in Day, batteries store it, everything powered draws it.
// In a shortage, equipment is shed by priority (ADR 0004).
import { BATTERY_FLOORS, EQUIPMENT_TYPES, LOWEST_PRIORITY, MODULE_SYSTEMS_PRIORITY, MODULE_TYPES, type Priority } from "./content";
import { FlowGraph, type ArcHandle } from "./flow";
import { connectionLimitsOf, networksOf, type ConnectionLimit, type Network } from "./networks";
import { isOffline, type ModuleId, type PlacedModule, type Station } from "./station";
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
  | { kind: "waiting-for-full-battery" }
  /** The station has the power, but a connection on the way here is full. */
  | { kind: "bottleneck" };

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
  /** True while the module's own systems run. False means it is dark, or offline. */
  powered: boolean;
  /** Offline (failed): it draws, makes and stores nothing, whatever its network can supply. */
  offline: boolean;
  /** Which of its equipment is running, in the module's slot and hardpoint order. Empty mounts are false. */
  running: { slots: boolean[]; hardpoints: boolean[] };
  runningUpTo: RunningUpTo;
  /** Why each of its shed tiers is off. */
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
  /** The lowest tier any of its modules runs at. */
  runningUpTo: RunningUpTo;
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
  /** Every connection on a power network, with its flow and whether it is a bottleneck. */
  connections: ConnectionFlow[];
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

// An offline module makes, uses and stores nothing until it recovers.

function loadsOf(station: Station, module: PlacedModule): Load[] {
  if (isOffline(station, module.id)) return [];
  const equipment = [...module.slots, ...module.hardpoints].flatMap((e) => (e ? [EQUIPMENT_TYPES[e]] : []));
  return [
    { priority: MODULE_SYSTEMS_PRIORITY, kw: MODULE_TYPES[module.type].draw },
    ...equipment.map((e) => ({ priority: e.priority, kw: e.draw })),
  ];
}

function packsOf(station: Station, module: PlacedModule): Pack[] {
  if (isOffline(station, module.id)) return [];
  return module.slots.flatMap((equipment, slot) => {
    const capacity = equipment ? (EQUIPMENT_TYPES[equipment] as { storage?: number }).storage : undefined;
    if (!capacity) return [];
    const key = batteryKey(module.id, slot);
    return [{ key, capacity, charge: Math.min(station.batteries[key] ?? 0, capacity) }];
  });
}

function solarOf(station: Station, module: PlacedModule, sunlit: boolean): number {
  if (!sunlit || isOffline(station, module.id)) return 0;
  return [...module.slots, ...module.hardpoints].reduce(
    (sum, e) => sum + ((e ? (EQUIPMENT_TYPES[e] as { solar?: number }).solar : undefined) ?? 0),
    0,
  );
}

const demandUpTo = (loads: Load[], upTo: RunningUpTo) =>
  loads.reduce((sum, l) => (l.priority <= upTo ? sum + l.kw : sum), 0);

/** One connection's flow this tick (power or heat). */
export interface ConnectionFlow extends ConnectionLimit {
  /** kW from a to b (negative: b to a). */
  flow: number;
  /** It limits what reaches the modules beyond it: a bigger connection would let more run. */
  bottleneck: boolean;
}

interface ModulePlan {
  module: PlacedModule;
  node: number;
  loads: Load[];
  /** Tier it ran at last tick; restarting above it needs sunlight alone or full batteries. */
  previous: RunningUpTo;
  runningUpTo: RunningUpTo;
  stored: number;
  capacity: number;
  solar: number;
  battery: ArcHandle;
  charge?: ArcHandle;
  /** kW into its batteries this tick (negative: out of them). */
  netCharge: number;
  shed: ShedTiers;
}

interface Resolved {
  network: Network;
  plans: ModulePlan[];
  production: number;
  demand: number;
  draw: number;
  stored: number;
  capacity: number;
  connections: ConnectionFlow[];
}

const SOURCE = 0;
const SINK = 1;

/**
 * Decides what runs on one network for the coming tick, routing power through
 * its connections (connection bottlenecks).
 *
 * Tiers are served in priority order, each on top of the last, so a lower tier
 * never takes power a higher one needs. A module runs a tier only if all of
 * that tier's load at the module gets through; modules that don't fit are
 * dropped from the tier and the rest tried again.
 *
 * Shedding: a tier may draw batteries only down to its floor (ADR 0004).
 * Restarting: a module above the tier it ran last tick needs sunlight alone,
 * or full batteries, so equipment doesn't flicker as a battery gains charge.
 */
function resolve(station: Station, network: Network, sunlit: boolean, findBottlenecks: boolean): Resolved {
  const modules = network.moduleIds.map((id) => station.modules.find((m) => m.id === id) as PlacedModule);
  const graph = new FlowGraph(modules.length + 2);
  const nodeOf = new Map(modules.map((m, i) => [m.id, i + 2]));

  // A module new to a shedding network is held to the most shed of its members.
  const recorded = modules.flatMap((m) => {
    const value = station.powerRunningUpTo[m.id];
    return value === undefined ? [] : [value];
  });
  const fallback = Math.min(LOWEST_PRIORITY, ...recorded);

  const connections = connectionLimitsOf(station, network, "power").map((connection) => ({
    connection,
    twoWay: graph.addTwoWay(nodeOf.get(connection.a) as number, nodeOf.get(connection.b) as number, connection.capacity),
  }));
  const plans: ModulePlan[] = modules.map((module) => {
    const packs = packsOf(station, module);
    return {
      module,
      node: nodeOf.get(module.id) as number,
      loads: loadsOf(station, module),
      previous: station.powerRunningUpTo[module.id] ?? fallback,
      runningUpTo: 0,
      stored: packs.reduce((sum, p) => sum + p.charge, 0),
      capacity: packs.reduce((sum, p) => sum + p.capacity, 0),
      solar: solarOf(station, module, sunlit),
      // Placeholders; set below so every solar arc comes before any battery arc
      // and searches use sunlight first.
      battery: { node: 0, index: 0 },
      netCharge: 0,
      shed: {},
    };
  });
  for (const plan of plans) graph.addArc(SOURCE, plan.node, plan.solar);
  for (const plan of plans) plan.battery = graph.addArc(SOURCE, plan.node, 0);

  const production = plans.reduce((sum, p) => sum + p.solar, 0);
  const stored = plans.reduce((sum, p) => sum + p.stored, 0);
  const capacity = plans.reduce((sum, p) => sum + p.capacity, 0);
  const full = capacity > 0 && stored >= capacity - FULL_TOLERANCE;

  /** kW each module's batteries may give while serving up to `tier`, never less than they already give. */
  const allowBatteries = (tier: Priority) => {
    for (const p of plans) {
      const available = Math.max(0, p.stored - BATTERY_FLOORS[tier] * p.capacity) / HOURS_PER_TICK;
      graph.setCapacity(p.battery, Math.max(graph.flow(p.battery), available));
    }
  };
  const freezeBatteries = () => {
    for (const p of plans) graph.setCapacity(p.battery, graph.flow(p.battery));
  };

  /** Serves one tier's extra load at each of `group`, dropping modules it can't fully serve. */
  const serve = (group: ModulePlan[], tier: Priority, batteries: boolean) => {
    let trying = group;
    while (trying.length > 0) {
      const before = graph.clone();
      const arcs = trying.map((p) => {
        const extra = demandUpTo(p.loads, tier) - demandUpTo(p.loads, tier - 1);
        return extra > 0 ? graph.addArc(p.node, SINK, extra) : undefined;
      });
      // Sunlight first, then batteries if allowed.
      freezeBatteries();
      graph.augment(SOURCE, SINK);
      if (batteries) allowBatteries(tier);
      graph.augment(SOURCE, SINK);
      const failed = trying.filter((_, i) => {
        const arc = arcs[i];
        return arc !== undefined && !graph.saturated(arc);
      });
      if (failed.length === 0) {
        for (const p of trying) p.runningUpTo = tier;
        return;
      }
      // Drop one module and try again: the most recently built that came up short.
      // (Dropping them all at once could lose modules that fit on their own.)
      graph.restore(before);
      const drop = failed[failed.length - 1];
      trying = trying.filter((p) => p !== drop);
    }
  };

  for (let tier = 1 as Priority; tier <= LOWEST_PRIORITY; tier = (tier + 1) as Priority) {
    allowBatteries(tier);
    const candidates = plans.filter((p) => p.runningUpTo === tier - 1);
    serve(
      candidates.filter((p) => tier <= p.previous),
      tier,
      true,
    );
    serve(
      candidates.filter((p) => tier > p.previous),
      tier,
      full,
    );
  }

  // Whatever sunlight is left charges batteries it can reach.
  freezeBatteries();
  for (const p of plans) {
    if (p.capacity > p.stored) p.charge = graph.addArc(p.node, SINK, (p.capacity - p.stored) / HOURS_PER_TICK);
  }
  graph.augment(SOURCE, SINK);
  for (const p of plans) p.netCharge = (p.charge ? graph.flow(p.charge) : 0) - graph.flow(p.battery);

  // Bottlenecks: try to serve everything still shed, with batteries down to empty;
  // connections on the cut between what power can reach and what it can't are the limit.
  let reach: Set<number> | undefined;
  if (findBottlenecks) {
    const trial = graph.clone();
    for (const p of plans) {
      const missing = demandUpTo(p.loads, LOWEST_PRIORITY) - demandUpTo(p.loads, p.runningUpTo);
      if (missing > 0) trial.addArc(p.node, SINK, missing);
      trial.setCapacity(p.battery, Math.max(trial.flow(p.battery), p.stored / HOURS_PER_TICK));
    }
    trial.augment(SOURCE, SINK);
    reach = trial.reachable(SOURCE);
  }
  const reachesModules = reach !== undefined && plans.some((p) => reach?.has(p.node));

  // Why each module's shed tiers are off.
  const loads = plans.flatMap((p) => p.loads);
  const coverable = (tier: Priority) => {
    const deficit = (demandUpTo(loads, tier) - production) * HOURS_PER_TICK;
    return deficit <= 0 || deficit <= stored - BATTERY_FLOORS[tier] * capacity;
  };
  for (const p of plans) {
    for (let tier = p.runningUpTo + 1; tier <= LOWEST_PRIORITY; tier++) {
      const t = tier as Priority;
      p.shed[t] =
        reachesModules && !reach?.has(p.node)
          ? { kind: "bottleneck" }
          : !coverable(t)
            ? capacity > 0
              ? { kind: "battery-floor", floor: BATTERY_FLOORS[t] }
              : { kind: "no-supply" }
            : t > p.previous
              ? { kind: "waiting-for-full-battery" }
              : { kind: "bottleneck" };
    }
  }

  return {
    network,
    plans,
    production,
    demand: plans.reduce((sum, p) => sum + demandUpTo(p.loads, LOWEST_PRIORITY), 0),
    draw: plans.reduce((sum, p) => sum + demandUpTo(p.loads, p.runningUpTo), 0),
    stored,
    capacity,
    connections: connections.map(({ connection, twoWay }) => {
      const nodeA = nodeOf.get(connection.a) as number;
      const nodeB = nodeOf.get(connection.b) as number;
      const flow = graph.flow(twoWay);
      const cut = reach !== undefined && reach.has(nodeA) !== reach.has(nodeB);
      return { ...connection, flow, bottleneck: reachesModules && cut };
    }),
  };
}

function modulePower(station: Station, module: PlacedModule, sunlit: boolean, plan?: ModulePlan): ModulePower {
  const loads = loadsOf(station, module);
  const packs = packsOf(station, module);
  const offline = isOffline(station, module.id);
  const runningUpTo = plan?.runningUpTo ?? 0;
  const runs = (e: keyof typeof EQUIPMENT_TYPES | null) =>
    !offline && e !== null && EQUIPMENT_TYPES[e].priority <= runningUpTo;
  return {
    production: solarOf(station, module, sunlit),
    demand: demandUpTo(loads, LOWEST_PRIORITY),
    draw: demandUpTo(loads, runningUpTo),
    stored: packs.reduce((sum, p) => sum + p.charge, 0),
    capacity: packs.reduce((sum, p) => sum + p.capacity, 0),
    powered: !offline && runningUpTo >= MODULE_SYSTEMS_PRIORITY,
    offline,
    running: { slots: module.slots.map(runs), hardpoints: module.hardpoints.map(runs) },
    runningUpTo,
    shed: plan?.shed ?? {},
  };
}

/** Current power figures for the station, each network, module and connection: what runs this coming tick. */
export function powerOf(station: Station): PowerReport {
  return powerReport(station, true);
}

/**
 * The power report, optionally without working out which connections are
 * bottlenecks (only the view needs that; the tick doesn't).
 */
export function powerReport(station: Station, findBottlenecks: boolean): PowerReport {
  const sunlit = orbitOf(station).phase === "day";
  const modules: Record<ModuleId, ModulePower> = {};
  const connections: ConnectionFlow[] = [];
  const networks = networksOf(station, "power").map((network): NetworkPower => {
    const r = resolve(station, network, sunlit, findBottlenecks);
    for (const p of r.plans) modules[p.module.id] = modulePower(station, p.module, sunlit, p);
    connections.push(...r.connections);
    const runningUpTo = Math.min(...r.plans.map((p) => p.runningUpTo));
    return {
      moduleIds: network.moduleIds,
      production: r.production,
      demand: r.demand,
      draw: r.draw,
      stored: r.stored,
      capacity: r.capacity,
      powered: r.plans.every((p) => p.runningUpTo >= MODULE_SYSTEMS_PRIORITY),
      supplied: r.plans.every((p) => p.runningUpTo >= LOWEST_PRIORITY),
      runningUpTo,
    };
  });
  // On hard difficulty an offline module belongs to no network; it still gets (empty) figures.
  for (const m of station.modules) modules[m.id] ??= modulePower(station, m, sunlit);
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
    connections,
  };
}

/** One tick of power flow on every network: shed equipment draws nothing, batteries take the difference. */
export function stepPower(station: Station): Pick<Station, "batteries" | "powerRunningUpTo"> {
  const sunlit = orbitOf(station).phase === "day";
  // Batteries in offline modules sit out of every network but keep their charge.
  const batteries: Record<string, number> = Object.fromEntries(
    Object.entries(station.batteries).filter(([key]) => isOffline(station, Number(key.split(":")[0]))),
  );
  const powerRunningUpTo: Record<ModuleId, RunningUpTo> = {};

  for (const network of networksOf(station, "power")) {
    const r = resolve(station, network, sunlit, false);
    for (const p of r.plans) {
      powerRunningUpTo[p.module.id] = p.runningUpTo;
      // Each module's batteries give what flowed out of them and take what flowed in.
      let energy = p.netCharge * HOURS_PER_TICK;
      for (const pack of packsOf(station, p.module)) {
        const change = energy >= 0 ? Math.min(energy, pack.capacity - pack.charge) : -Math.min(-energy, pack.charge);
        batteries[pack.key] = pack.charge + change;
        energy -= change;
      }
    }
  }
  return { batteries, powerRunningUpTo };
}
