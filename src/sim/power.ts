// Power: solar panels make it in Day, batteries store it, everything powered draws it.
import { EQUIPMENT_TYPES, MODULE_TYPES } from "./content";
import { networksOf, type Network } from "./networks";
import type { ModuleId, PlacedModule, Station } from "./station";
import { orbitOf, SECONDS_PER_TICK } from "./time";

const HOURS_PER_TICK = SECONDS_PER_TICK / 3600;

export interface ModulePower {
  /** kW made by its solar panels right now. */
  production: number;
  /** kW drawn by the module and its equipment. */
  demand: number;
  /** kWh in its batteries. */
  stored: number;
  capacity: number;
  /** False when its network can't meet demand from sunlight and storage: its equipment has stopped. */
  powered: boolean;
}

export interface NetworkPower extends Omit<ModulePower, "powered"> {
  moduleIds: ModuleId[];
  powered: boolean;
}

export interface PowerReport extends Omit<NetworkPower, "moduleIds"> {
  /** production - demand, in kW. Negative means batteries are draining. */
  balance: number;
  networks: NetworkPower[];
  modules: Record<ModuleId, ModulePower>;
}

export function batteryKey(moduleId: ModuleId, slot: number): string {
  return `${moduleId}:${slot}`;
}

interface Battery {
  key: string;
  capacity: number;
}

function batteriesIn(module: PlacedModule): Battery[] {
  return module.slots.flatMap((equipment, slot) => {
    const storage = equipment ? (EQUIPMENT_TYPES[equipment] as { storage?: number }).storage : undefined;
    return storage ? [{ key: batteryKey(module.id, slot), capacity: storage }] : [];
  });
}

function moduleFigures(station: Station, module: PlacedModule, sunlit: boolean) {
  const equipment = [...module.slots, ...module.hardpoints].flatMap((e) => (e ? [EQUIPMENT_TYPES[e]] : []));
  const batteries = batteriesIn(module);
  return {
    production: sunlit ? equipment.reduce((sum, e) => sum + ((e as { solar?: number }).solar ?? 0), 0) : 0,
    demand: MODULE_TYPES[module.type].draw + equipment.reduce((sum, e) => sum + e.draw, 0),
    stored: batteries.reduce((sum, b) => sum + (station.batteries[b.key] ?? 0), 0),
    capacity: batteries.reduce((sum, b) => sum + b.capacity, 0),
    batteries,
  };
}

/** Current power figures for the station, each network and each module. */
export function powerOf(station: Station): PowerReport {
  const sunlit = orbitOf(station).phase === "day";
  const modules: Record<ModuleId, ModulePower> = {};
  const networks = networksOf(station, "power").map((network): NetworkPower => {
    const totals = { production: 0, demand: 0, stored: 0, capacity: 0 };
    const figures = network.moduleIds.map((id) => {
      const module = station.modules.find((m) => m.id === id) as PlacedModule;
      const { batteries: _unused, ...rest } = moduleFigures(station, module, sunlit);
      totals.production += rest.production;
      totals.demand += rest.demand;
      totals.stored += rest.stored;
      totals.capacity += rest.capacity;
      return [id, rest] as const;
    });
    const powered = canCover(totals.production - totals.demand, totals.stored);
    for (const [id, rest] of figures) modules[id] = { ...rest, powered };
    return { ...totals, moduleIds: network.moduleIds, powered };
  });
  const sum = (key: "production" | "demand" | "stored" | "capacity") =>
    networks.reduce((total, n) => total + n[key], 0);
  return {
    production: sum("production"),
    demand: sum("demand"),
    balance: sum("production") - sum("demand"),
    stored: sum("stored"),
    capacity: sum("capacity"),
    powered: networks.every((n) => n.powered),
    networks,
    modules,
  };
}

/** A network is powered for the next tick if sunlight plus storage covers its demand. */
function canCover(surplusKw: number, storedKwh: number): boolean {
  return surplusKw >= 0 || storedKwh >= -surplusKw * HOURS_PER_TICK;
}

/** One tick of power flow on every network: batteries charge from surplus and cover deficits. */
export function stepPower(station: Station): Pick<Station, "batteries"> {
  const sunlit = orbitOf(station).phase === "day";
  const batteries: Record<string, number> = {};

  for (const network of networksOf(station, "power")) {
    const { surplus, packs } = gather(station, network, sunlit);
    let energy = surplus * HOURS_PER_TICK;

    if (energy >= 0) {
      for (const pack of packs) {
        const added = Math.min(energy, pack.capacity - pack.charge);
        pack.charge += added;
        energy -= added;
      }
    } else {
      for (const pack of packs) {
        const taken = Math.min(-energy, pack.charge);
        pack.charge -= taken;
        energy += taken;
      }
    }
    for (const pack of packs) batteries[pack.key] = pack.charge;
  }
  return { batteries };
}

function gather(station: Station, network: Network, sunlit: boolean) {
  let surplus = 0;
  const packs: { key: string; capacity: number; charge: number }[] = [];
  for (const id of network.moduleIds) {
    const module = station.modules.find((m) => m.id === id) as PlacedModule;
    const figures = moduleFigures(station, module, sunlit);
    surplus += figures.production - figures.demand;
    for (const b of figures.batteries) {
      packs.push({ ...b, charge: Math.min(station.batteries[b.key] ?? 0, b.capacity) });
    }
  }
  return { surplus, packs };
}
