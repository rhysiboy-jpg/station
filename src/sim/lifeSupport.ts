// Crew and life support: each pressurised module has its own air, mixed slowly
// with its neighbours by fans; water is held in tanks shared across each water
// network. Equipment only works while power says it is running (ADR 0004).
import {
  CREW,
  EQUIPMENT_TYPES,
  MODULE_TYPES,
  NOMINAL_O2_KPA,
  WATER_PER_KG_OXYGEN,
  type EquipmentType,
} from "./content";
import { networksOf } from "./networks";
import { connectionsOf } from "./placement";
import type { PowerReport } from "./power";
import { bedsOf, crewOf, isOffline, offlineCutsNetworks, type Air, type ModuleId, type PlacedModule, type Station } from "./station";
import { SECONDS_PER_TICK } from "./time";

const DAYS_PER_TICK = SECONDS_PER_TICK / 86_400;

// Ideal gas at cabin temperature (21 °C): partial pressure per kg/m³ of each gas.
const RT_KJ = (8.314 * 294.15) / 1000;
const KPA_PER_DENSITY = { o2: RT_KJ / 0.032, co2: RT_KJ / 0.044 };

export interface ModuleAir {
  crew: number;
  /** Oxygen partial pressure, in kPa. */
  o2: number;
  /** CO2 partial pressure, in kPa. */
  co2: number;
}

export interface WaterNetwork {
  moduleIds: ModuleId[];
  /** kg in its tanks. */
  stored: number;
  capacity: number;
}

export interface LifeSupportReport {
  crew: number;
  beds: number;
  /** Air in each pressurised module. */
  modules: Record<ModuleId, ModuleAir>;
  water: { stored: number; capacity: number; networks: WaterNetwork[] };
}

const volumeOf = (module: PlacedModule) => MODULE_TYPES[module.type].volume;

function freshAir(volume: number): Air {
  return { o2: (NOMINAL_O2_KPA / KPA_PER_DENSITY.o2) * volume, co2: 0 };
}

function airOf(station: Station, module: PlacedModule): Air {
  return station.air[module.id] ?? freshAir(volumeOf(module));
}

function tankOf(station: Station, module: PlacedModule): number {
  const capacity = MODULE_TYPES[module.type].waterTank;
  return Math.min(station.water[module.id] ?? capacity, capacity);
}

/** Running equipment in a module, by power's verdict. */
function runningEquipment(module: PlacedModule, power: PowerReport): EquipmentType[] {
  const running = power.modules[module.id]?.running.slots ?? [];
  return module.slots.flatMap((e, i) => (e && running[i] ? [EQUIPMENT_TYPES[e] as EquipmentType] : []));
}

export function lifeSupportOf(station: Station): LifeSupportReport {
  const modules: Record<ModuleId, ModuleAir> = {};
  for (const module of station.modules) {
    const volume = volumeOf(module);
    if (!MODULE_TYPES[module.type].pressurised || volume === 0) continue;
    const air = airOf(station, module);
    modules[module.id] = {
      crew: module.crew,
      o2: (air.o2 / volume) * KPA_PER_DENSITY.o2,
      co2: (air.co2 / volume) * KPA_PER_DENSITY.co2,
    };
  }
  const networks = networksOf(station, "water").map((network): WaterNetwork => {
    const members = network.moduleIds.map((id) => station.modules.find((m) => m.id === id) as PlacedModule);
    return {
      moduleIds: network.moduleIds,
      stored: members.reduce((sum, m) => sum + tankOf(station, m), 0),
      capacity: members.reduce((sum, m) => sum + MODULE_TYPES[m.type].waterTank, 0),
    };
  });
  return {
    crew: crewOf(station.modules),
    beds: bedsOf(station.modules),
    modules,
    water: {
      stored: networks.reduce((sum, n) => sum + n.stored, 0),
      capacity: networks.reduce((sum, n) => sum + n.capacity, 0),
      networks,
    },
  };
}

/** One tick of breathing, drinking, life support equipment and air mixing. */
export function stepLifeSupport(station: Station, power: PowerReport): Pick<Station, "air" | "water"> {
  const air: Record<ModuleId, Air> = {};
  const pressurised = station.modules.filter((m) => MODULE_TYPES[m.type].pressurised && volumeOf(m) > 0);
  for (const m of pressurised) air[m.id] = { ...airOf(station, m) };

  // Crew breathe.
  for (const m of pressurised) {
    const gas = air[m.id] as Air;
    gas.o2 = Math.max(0, gas.o2 - m.crew * CREW.oxygenPerDay * DAYS_PER_TICK);
    gas.co2 += m.crew * CREW.co2PerDay * DAYS_PER_TICK;
  }

  // Each water network: the oxygen generator splits water, crew drink, the recycler wins some back.
  // Tanks outside every network (offline, on hard difficulty) keep what they hold.
  const water: Record<ModuleId, number> = {};
  for (const m of station.modules) {
    const held = station.water[m.id];
    if (isOffline(station, m.id) && held !== undefined) water[m.id] = held;
  }
  for (const network of networksOf(station, "water")) {
    const members = network.moduleIds.map((id) => station.modules.find((m) => m.id === id) as PlacedModule);
    const capacity = members.reduce((sum, m) => sum + MODULE_TYPES[m.type].waterTank, 0);
    let stored = members.reduce((sum, m) => sum + tankOf(station, m), 0);
    let treatable = 0;
    let recovery = 0;

    for (const m of members) {
      const gas = air[m.id];
      for (const e of runningEquipment(m, power)) {
        if (gas && e.oxygenPerDay) {
          const shortfall = Math.max(0, freshAir(volumeOf(m)).o2 - gas.o2);
          const made = Math.min(e.oxygenPerDay * DAYS_PER_TICK, shortfall, stored / WATER_PER_KG_OXYGEN);
          gas.o2 += made;
          stored -= made * WATER_PER_KG_OXYGEN;
        }
        if (gas && e.co2PerDay) gas.co2 -= Math.min(e.co2PerDay * DAYS_PER_TICK, gas.co2);
        if (e.waterPerDay && e.recovery) {
          // Several recyclers on one network pool their throughput at their mean recovery.
          recovery = (recovery * treatable + e.recovery * e.waterPerDay) / (treatable + e.waterPerDay);
          treatable += e.waterPerDay;
        }
      }
    }

    const wanted = crewOf(members) * CREW.waterPerDay * DAYS_PER_TICK;
    const drunk = Math.min(stored, wanted);
    stored -= drunk;
    stored = Math.min(capacity, stored + recovery * Math.min(drunk, treatable * DAYS_PER_TICK));

    for (const m of members) {
      const tank = MODULE_TYPES[m.type].waterTank;
      if (tank > 0) water[m.id] = capacity > 0 ? (stored * tank) / capacity : 0;
    }
  }

  // Fans swap a little air across each connection between pressurised modules,
  // all computed from the same snapshot so the order of connections doesn't matter.
  const cut = offlineCutsNetworks(station);
  const deltas = new Map<ModuleId, Air>(pressurised.map((m) => [m.id, { o2: 0, co2: 0 }]));
  const volumes = new Map(pressurised.map((m) => [m.id, volumeOf(m)]));
  for (const { a, b } of connectionsOf(station)) {
    const airA = air[a.moduleId];
    const airB = air[b.moduleId];
    if (!airA || !airB) continue;
    if (cut && (isOffline(station, a.moduleId) || isOffline(station, b.moduleId))) continue;
    // Fans move the slower of the two modules' rates (the connection's air capacity).
    const ma = station.modules.find((m) => m.id === a.moduleId) as PlacedModule;
    const mb = station.modules.find((m) => m.id === b.moduleId) as PlacedModule;
    const exchanged = Math.min(MODULE_TYPES[ma.type].capacity.air, MODULE_TYPES[mb.type].capacity.air) * SECONDS_PER_TICK;
    const va = volumes.get(a.moduleId) as number;
    const vb = volumes.get(b.moduleId) as number;
    for (const gas of ["o2", "co2"] as const) {
      const flow = exchanged * (airA[gas] / va - airB[gas] / vb);
      (deltas.get(a.moduleId) as Air)[gas] -= flow;
      (deltas.get(b.moduleId) as Air)[gas] += flow;
    }
  }
  for (const [id, delta] of deltas) {
    const gas = air[id] as Air;
    gas.o2 = Math.max(0, gas.o2 + delta.o2);
    gas.co2 = Math.max(0, gas.co2 + delta.co2);
  }

  return { air, water };
}
