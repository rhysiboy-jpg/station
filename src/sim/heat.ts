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
import { networksOf } from "./networks";
import { connectionsOf } from "./placement";
import { powerOf, type PowerReport } from "./power";
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
}

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
 * the most heat warm fastest and leak into their neighbours.
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

  const networks = networksOf(station, "heat").map((network): HeatNetwork => {
    const members = network.moduleIds.map((id) => byId.get(id) as PlacedModule);
    const capacity = members.reduce((sum, m) => sum + radiatorCapacity(m, power), 0);
    const wants = members.map((m) => {
      const heat = modules[m.id] as ModuleHeat;
      const excess = Math.max(0, heat.temperature - NOMINAL_TEMPERATURE) * MODULE_TYPES[m.type].heatCapacity;
      return heat.made + excess / HEAT_RECOVERY_SECONDS;
    });
    const wanted = wants.reduce((sum, w) => sum + w, 0);
    const share = wanted > 0 ? Math.min(1, capacity / wanted) : 0;
    members.forEach((m, i) => {
      (modules[m.id] as ModuleHeat).removed = share * (wants[i] as number);
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

  return { modules, networks };
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
