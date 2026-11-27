// Power: solar panels make it in Day, batteries store it, everything powered draws it.
// In a shortage, equipment is shed by priority (ADR 0004).
import { BATTERY_FLOORS, EQUIPMENT_TYPES, LOWEST_PRIORITY, MODULE_SYSTEMS_PRIORITY, MODULE_TYPES, type Priority } from "./content";
import { addLimits, FlowGraph, limitFlows, type ArcHandle } from "./flow";
import { connectionLimitsOf, networksOf, type ConnectionLimit, type Network } from "./networks";
import type { MountRef } from "./equipment";
import { isOffline, moduleById, type ModuleId, type PlacedModule, type Station } from "./station";
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
  /** Where the equipment is fitted; absent for the module's own systems. */
  mount?: MountRef;
}

interface Pack {
  key: string;
  capacity: number;
  charge: number;
}

// An offline module makes, uses and stores nothing until it recovers.

/**
 * A module's loads in the order they run: its own systems first, then its
 * equipment by priority tier, and within a tier in slot-then-hardpoint order.
 * A module always runs a prefix of this list, so shedding takes items from
 * the end, one at a time (ADR 0004).
 */
function loadsOf(station: Station, module: PlacedModule): Load[] {
  if (isOffline(station, module.id)) return [];
  const fitted = (list: (keyof typeof EQUIPMENT_TYPES | null)[], kind: MountRef["kind"]): Load[] =>
    list.flatMap((e, index) => (e ? [{ priority: EQUIPMENT_TYPES[e].priority, kw: EQUIPMENT_TYPES[e].draw, mount: { kind, index } }] : []));
  const equipment = [...fitted(module.slots, "slot"), ...fitted(module.hardpoints, "hardpoint")];
  // A stable sort keeps slot-then-hardpoint order within each tier.
  equipment.sort((a, b) => a.priority - b.priority);
  return [{ priority: MODULE_SYSTEMS_PRIORITY, kw: MODULE_TYPES[module.type].draw }, ...equipment];
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

/** kWh held and the most it can hold, across some battery packs. */
const packTotals = (packs: Pack[]) => ({
  stored: packs.reduce((sum, p) => sum + p.charge, 0),
  capacity: packs.reduce((sum, p) => sum + p.capacity, 0),
});

/** kW drawn by the first `count` loads. */
const drawOf = (loads: Load[], count: number) => loads.slice(0, count).reduce((sum, l) => sum + l.kw, 0);

/** The highest tier whose loads all run, when the first `count` loads do. */
function fullTiers(loads: Load[], count: number): RunningUpTo {
  if (count >= loads.length) return LOWEST_PRIORITY;
  if (count === 0) return 0;
  return (loads[count] as Load).priority - 1;
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
  /** How many of its loads ran last tick; restarting any beyond those needs sunlight alone or full batteries. */
  previous: number;
  /** How many of its loads run this tick: always a prefix of `loads`. */
  running: number;
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
  const modules = network.moduleIds.map((id) => moduleById(station, id));
  const graph = new FlowGraph(modules.length + 2);
  const nodes = new Map(modules.map((m, i) => [m.id, i + 2]));
  const nodeOf = (id: ModuleId) => nodes.get(id) as number;

  // A module new to a shedding network is held to the most shed tier of its members.
  const loadsByModule = new Map(modules.map((m) => [m.id, loadsOf(station, m)]));
  const recordedTiers = modules.flatMap((m) => {
    const count = station.powerLoadsRunning[m.id];
    return count === undefined ? [] : [fullTiers(loadsByModule.get(m.id) as Load[], count)];
  });
  const fallbackTier = Math.min(LOWEST_PRIORITY, ...recordedTiers);

  const limits = connectionLimitsOf(station, network, "power");
  const handles = addLimits(graph, limits, nodeOf);
  const plans: ModulePlan[] = modules.map((module) => {
    const packs = packsOf(station, module);
    return {
      module,
      node: nodeOf(module.id),
      loads: loadsByModule.get(module.id) as Load[],
      previous:
        station.powerLoadsRunning[module.id] ??
        (loadsByModule.get(module.id) as Load[]).filter((l) => l.priority <= fallbackTier).length,
      running: 0,
      runningUpTo: 0,
      ...packTotals(packs),
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

  /**
   * Serves the given items (each module's next few loads, in order), dropping
   * from the end one item at a time until everything left gets through. A
   * module's items run as a prefix: if one can't, none after it does.
   */
  const serve = (group: { plan: ModulePlan; count: number }[], tier: Priority, batteries: boolean) => {
    const want = group.map((g) => ({ ...g }));
    for (;;) {
      if (want.every((w) => w.count === 0)) return;
      const before = graph.clone();
      const arcs = want.map(({ plan, count }) =>
        plan.loads.slice(plan.running, plan.running + count).map((l) => (l.kw > 0 ? graph.addArc(plan.node, SINK, l.kw) : undefined)),
      );
      // Sunlight first, then batteries if allowed.
      freezeBatteries();
      graph.augment(SOURCE, SINK);
      if (batteries) allowBatteries(tier);
      graph.augment(SOURCE, SINK);
      let short = -1;
      want.forEach((_, i) => {
        if ((arcs[i] ?? []).some((arc) => arc !== undefined && !graph.saturated(arc))) short = i;
      });
      if (short === -1) {
        for (const w of want) w.plan.running += w.count;
        return;
      }
      // Drop the last item of the most recently built module that came up short, and try again.
      graph.restore(before);
      (want[short] as { count: number }).count -= 1;
    }
  };

  /** How many of a plan's next loads are in `tier`. */
  const tierCount = (p: ModulePlan, tier: Priority) =>
    p.loads.slice(p.running).filter((l) => l.priority === tier).length;

  for (let tier = 1 as Priority; tier <= LOWEST_PRIORITY; tier = (tier + 1) as Priority) {
    allowBatteries(tier);
    // Only modules running every lower load go on to this tier.
    const steps = plans
      .filter((p) => p.running === p.loads.filter((l) => l.priority < tier).length)
      .map((plan) => {
        const start = plan.running;
        const count = tierCount(plan, tier);
        // Items up to what ran last tick may draw batteries to the tier's floor;
        // items beyond it restart only on sunlight alone, or full batteries.
        const keep = Math.max(0, Math.min(count, plan.previous - start));
        return { plan, start, count, keep };
      });
    serve(steps.map(({ plan, keep }) => ({ plan, count: keep })), tier, true);
    serve(
      steps
        .filter(({ plan, start, keep }) => plan.running === start + keep)
        .map(({ plan, count, keep }) => ({ plan, count: count - keep })),
      tier,
      full,
    );
    for (const p of plans) p.runningUpTo = fullTiers(p.loads, p.running);
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
      const missing = demandUpTo(p.loads, LOWEST_PRIORITY) - drawOf(p.loads, p.running);
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
      // Only tiers with something actually stopped get a reason.
      if (!p.loads.slice(p.running).some((l) => l.priority === t)) continue;
      p.shed[t] =
        reachesModules && !reach?.has(p.node)
          ? { kind: "bottleneck" }
          : !coverable(t)
            ? capacity > 0
              ? { kind: "battery-floor", floor: BATTERY_FLOORS[t] }
              : { kind: "no-supply" }
            : p.running >= p.previous
              ? { kind: "waiting-for-full-battery" }
              : { kind: "bottleneck" };
    }
  }

  return {
    network,
    plans,
    production,
    demand: plans.reduce((sum, p) => sum + demandUpTo(p.loads, LOWEST_PRIORITY), 0),
    draw: plans.reduce((sum, p) => sum + drawOf(p.loads, p.running), 0),
    stored,
    capacity,
    connections: limitFlows(graph, limits, handles, nodeOf, reach).map(({ onCut, ...c }) => ({
      ...c,
      bottleneck: reachesModules && onCut,
    })),
  };
}

function modulePower(station: Station, module: PlacedModule, sunlit: boolean, plan?: ModulePlan): ModulePower {
  const loads = loadsOf(station, module);
  const packs = packsOf(station, module);
  const offline = isOffline(station, module.id);
  const count = plan?.running ?? 0;
  const runningUpTo = fullTiers(loads, count);
  // The first `count` loads run; mark the equipment behind them.
  const running = { slots: module.slots.map(() => false), hardpoints: module.hardpoints.map(() => false) };
  for (const load of loads.slice(0, offline ? 0 : count)) {
    if (load.mount) running[load.mount.kind === "slot" ? "slots" : "hardpoints"][load.mount.index] = true;
  }
  return {
    production: solarOf(station, module, sunlit),
    demand: demandUpTo(loads, LOWEST_PRIORITY),
    draw: drawOf(loads, count),
    ...packTotals(packs),
    powered: !offline && count >= 1,
    offline,
    running,
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
export function stepPower(station: Station): Pick<Station, "batteries" | "powerLoadsRunning"> {
  const sunlit = orbitOf(station).phase === "day";
  // Batteries in offline modules sit out of every network but keep their charge.
  const batteries: Record<string, number> = Object.fromEntries(
    Object.entries(station.batteries).filter(([key]) => isOffline(station, Number(key.split(":")[0]))),
  );
  const powerLoadsRunning: Record<ModuleId, number> = {};

  for (const network of networksOf(station, "power")) {
    const r = resolve(station, network, sunlit, false);
    for (const p of r.plans) {
      powerLoadsRunning[p.module.id] = p.running;
      // Each module's batteries give what flowed out of them and take what flowed in.
      let energy = p.netCharge * HOURS_PER_TICK;
      for (const pack of packsOf(station, p.module)) {
        const change = energy >= 0 ? Math.min(energy, pack.capacity - pack.charge) : -Math.min(-energy, pack.charge);
        batteries[pack.key] = pack.charge + change;
        energy -= change;
      }
    }
  }
  return { batteries, powerLoadsRunning };
}
