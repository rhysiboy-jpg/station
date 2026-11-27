// Heat: everything powered, and every crew member, warms its module. Each heat
// network's cooling loop carries heat to the radiators on it; a little heat
// also leaks through each joint between attached modules.
import {
  CREW,
  EQUIPMENT_TYPES,
  HEAT_LEAK_KW_PER_C,
  HEAT_RECOVERY_SECONDS,
  MODULE_TYPES,
  NOMINAL_TEMPERATURE,
} from "./content";
import { FlowGraph, type ArcHandle } from "./flow";
import { jointsOf, networksOf } from "./networks";
import { connectionsOf } from "./placement";
import { powerOf, type JointFlow, type PowerReport } from "./power";
import type { ModuleId, PlacedModule, Station } from "./station";
import { SECONDS_PER_TICK } from "./time";

export interface ModuleHeat {
  /** °C. */
  temperature: number;
  /** kW made inside it: its power draw plus its crew. */
  made: number;
  /** kW the cooling loop is taking away. */
  removed: number;
  /** kW leaking out to attached modules (negative: leaking in). */
  leaked: number;
}

export interface HeatNetwork {
  moduleIds: ModuleId[];
  /** kW made on it. */
  load: number;
  /** kW its running radiators can reject. */
  capacity: number;
}

export interface HeatReport {
  modules: Record<ModuleId, ModuleHeat>;
  networks: HeatNetwork[];
  /** Every joint on a heat network, with the heat the loop carries through it. */
  joints: JointFlow[];
}

const SOURCE = 0;
const SINK = 1;
/** Precision of the fair share search, as a fraction of what each module wants removed. */
const SHARE_PRECISION = 1e-4;

const temperatureOf = (station: Station, id: ModuleId) => station.temperature[id] ?? NOMINAL_TEMPERATURE;

function radiatorCapacity(module: PlacedModule, power: PowerReport): number {
  const running = power.modules[module.id]?.running.hardpoints ?? [];
  return module.hardpoints.reduce(
    (sum, e, i) => sum + (e && running[i] ? ((EQUIPMENT_TYPES[e] as { rejects?: number }).rejects ?? 0) : 0),
    0,
  );
}

/**
 * The heat flows for the coming tick. A loop with spare capacity takes all the
 * heat each module makes, plus a pull back towards the set point. A loop that
 * can't keep up takes the same share from every module, so the modules making
 * the most heat warm fastest and leak into their neighbours. Heat reaches the
 * radiators through joints with a capacity: modules behind a full joint share
 * what gets through, and the rest are cooled as before.
 */
export function heatFlows(station: Station, power: PowerReport): HeatReport {
  const modules: Record<ModuleId, ModuleHeat> = {};
  const byId = new Map(station.modules.map((m) => [m.id, m]));

  for (const m of station.modules) {
    modules[m.id] = {
      temperature: temperatureOf(station, m.id),
      made: (power.modules[m.id]?.draw ?? 0) + m.crew * CREW.heatKw,
      removed: 0,
      leaked: 0,
    };
  }

  const allJoints: JointFlow[] = [];
  const networks = networksOf(station, "heat").map((network): HeatNetwork => {
    const members = network.moduleIds.map((id) => byId.get(id) as PlacedModule);
    const rejects = members.map((m) => radiatorCapacity(m, power));
    const capacity = rejects.reduce((sum, r) => sum + r, 0);
    const wants = members.map((m) => {
      const heat = modules[m.id] as ModuleHeat;
      const excess = Math.max(0, heat.temperature - NOMINAL_TEMPERATURE) * MODULE_TYPES[m.type].heatCapacity;
      return heat.made + excess / HEAT_RECOVERY_SECONDS;
    });
    const joints = jointsOf(station, network, "heat");
    const index = new Map(members.map((m, i) => [m.id, i]));

    /** A loop graph taking `amounts[i]` from each module, with links and radiators. */
    const build = (amounts: number[]) => {
      const graph = new FlowGraph(members.length + 2);
      const links = joints.map((j) =>
        graph.addLink((index.get(j.a) as number) + 2, (index.get(j.b) as number) + 2, j.capacity),
      );
      const takes = amounts.map((amount, i) => graph.addArc(SOURCE, i + 2, amount));
      rejects.forEach((r, i) => graph.addArc(i + 2, SINK, r));
      graph.augment(SOURCE, SINK);
      return { graph, links, takes };
    };
    const feasible = (amounts: number[]) => {
      const { graph, takes } = build(amounts);
      return takes.every((t) => graph.saturated(t));
    };

    // Progressive filling: raise everyone's share together; when someone can't
    // get more (a joint or radiator on their way is full), hold them there and
    // keep raising the rest.
    const removed = wants.map(() => 0);
    const fixed = wants.map((w) => w <= 0);
    let floor = 0;
    while (fixed.some((f) => !f)) {
      const at = (share: number) => wants.map((w, i) => (fixed[i] ? (removed[i] as number) : share * w));
      const spare = capacity - removed.reduce((sum, r, i) => sum + (fixed[i] ? r : 0), 0);
      const open = wants.reduce((sum, w, i) => sum + (fixed[i] ? 0 : w), 0);
      // Usually no joint binds and the radiators set the share for everyone.
      let share = Math.max(floor, Math.min(1, open > 0 ? spare / open : 1));
      if (!feasible(at(share))) {
        let low = floor;
        let high = share;
        while (high - low > SHARE_PRECISION) {
          const mid = (low + high) / 2;
          if (feasible(at(mid))) low = mid;
          else high = mid;
        }
        share = low;
      }
      const amounts = at(share);
      amounts.forEach((a, i) => (removed[i] = a));
      if (share >= 1) break;
      // Whoever can't push more on to a radiator is held at this share.
      const { graph } = build(amounts);
      const canGrow = graph.reaching(SINK);
      let held = 0;
      members.forEach((_, i) => {
        if (!fixed[i] && !canGrow.has(i + 2)) {
          fixed[i] = true;
          held++;
        }
      });
      if (held === 0) break;
      floor = share;
    }
    members.forEach((m, i) => {
      (modules[m.id] as ModuleHeat).removed = removed[i] as number;
    });

    // Report each joint's flow, and which joints keep heat from the radiators.
    const { graph, links } = build(removed);
    const trial = graph.clone();
    let unmet = false;
    wants.forEach((w, i) => {
      if (w - (removed[i] as number) > SHARE_PRECISION * Math.max(1, w)) unmet = true;
    });
    wants.forEach((w, i) => trial.addArc(SOURCE, i + 2, Math.max(0, w - (removed[i] as number))));
    trial.augment(SOURCE, SINK);
    // Heat that still can't reach a radiator stops at a cut; joints on the cut are the limit.
    const reach = trial.reachable(SOURCE);
    joints.forEach((j, k) => {
      const a = (index.get(j.a) as number) + 2;
      const b = (index.get(j.b) as number) + 2;
      const link = links[k] as ArcHandle;
      allJoints.push({ ...j, flow: graph.flow(link), bottleneck: unmet && reach.has(a) !== reach.has(b) });
    });

    return {
      moduleIds: network.moduleIds,
      load: members.reduce((sum, m) => sum + (modules[m.id] as ModuleHeat).made, 0),
      capacity,
    };
  });

  for (const { a, b } of connectionsOf(station)) {
    const heatA = modules[a.moduleId] as ModuleHeat;
    const heatB = modules[b.moduleId] as ModuleHeat;
    const flow = HEAT_LEAK_KW_PER_C * (heatA.temperature - heatB.temperature);
    heatA.leaked += flow;
    heatB.leaked -= flow;
  }

  return { modules, networks, joints: allJoints };
}

/** Current temperatures and heat flows for the station. */
export function heatOf(station: Station): HeatReport {
  return heatFlows(station, powerOf(station));
}

/** One tick of heating, cooling and leakage. */
export function stepHeat(station: Station, power: PowerReport): Pick<Station, "temperature"> {
  const report = heatFlows(station, power);
  const temperature: Record<ModuleId, number> = {};
  for (const m of station.modules) {
    const heat = report.modules[m.id] as ModuleHeat;
    const net = heat.made - heat.removed - heat.leaked;
    temperature[m.id] = heat.temperature + (net * SECONDS_PER_TICK) / MODULE_TYPES[m.type].heatCapacity;
  }
  return { temperature };
}
