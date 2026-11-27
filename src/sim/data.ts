// Data: lab racks make it while powered and tended by crew, data storage holds
// it, and antennas send it to Earth. Every module carries data, with no limit
// at joints (like water: real links carry far more than a few racks make).
// Ground contact is constant in the prototype; contact windows come later.
import { EQUIPMENT_TYPES, RACKS_PER_CREW, type EquipmentType } from "./content";
import { networksOf } from "./networks";
import { powerOf, type PowerReport } from "./power";
import type { ModuleId, PlacedModule, Station } from "./station";
import { SECONDS_PER_TICK } from "./time";

const HOURS_PER_TICK = SECONDS_PER_TICK / 3600;

export function storageKey(moduleId: ModuleId, slot: number): string {
  return `${moduleId}:${slot}`;
}

export interface ModuleData {
  /** GB per hour its racks are making. */
  produced: number;
  /** Lab racks working: powered and tended. */
  racksWorking: number;
  /** Lab racks powered but with no crew to tend them. */
  racksUntended: number;
  /** GB in its running data storage. */
  stored: number;
  capacity: number;
  /** GB per hour its running antennas can send. */
  downlink: number;
}

export interface DataNetwork {
  moduleIds: ModuleId[];
  produced: number;
  downlink: number;
  stored: number;
  capacity: number;
}

export interface DataReport {
  /** GB per hour being made across the station. */
  produced: number;
  /** GB per hour the station's antennas can send. */
  downlink: number;
  /** GB held in running data storage. */
  stored: number;
  capacity: number;
  /** GB sent to Earth so far. */
  downlinked: number;
  /** GB lost so far for want of storage or antennas. */
  lost: number;
  /** In touch with the ground. Always true in the prototype. */
  contact: boolean;
  networks: DataNetwork[];
  modules: Record<ModuleId, ModuleData>;
}

interface Store {
  key: string;
  capacity: number;
  held: number;
}

function moduleFigures(station: Station, module: PlacedModule, power: PowerReport) {
  const running = power.modules[module.id]?.running ?? { slots: [], hardpoints: [] };
  const typeOf = (e: string | null) => (e ? (EQUIPMENT_TYPES[e as keyof typeof EQUIPMENT_TYPES] as EquipmentType) : undefined);

  let racks = 0;
  let rackRate = 0;
  const stores: Store[] = [];
  module.slots.forEach((e, i) => {
    const type = typeOf(e);
    if (!type || !running.slots[i]) return;
    if (type.dataPerHour) {
      racks++;
      rackRate = type.dataPerHour;
    }
    if (type.dataStorage) {
      const key = storageKey(module.id, i);
      stores.push({ key, capacity: type.dataStorage, held: Math.min(station.data[key] ?? 0, type.dataStorage) });
    }
  });
  const tended = Math.min(racks, module.crew * RACKS_PER_CREW);
  const downlink = [...module.slots, ...module.hardpoints].reduce((sum, e, i) => {
    const on = i < module.slots.length ? running.slots[i] : running.hardpoints[i - module.slots.length];
    return sum + (on ? (typeOf(e)?.downlinkPerHour ?? 0) : 0);
  }, 0);
  return { produced: tended * rackRate, racksWorking: tended, racksUntended: racks - tended, stores, downlink };
}

/** Current data figures for the station. */
export function dataOf(station: Station): DataReport {
  return dataFlows(station, powerOf(station));
}

export function dataFlows(station: Station, power: PowerReport): DataReport {
  const modules: Record<ModuleId, ModuleData> = {};
  const networks = networksOf(station, "data").map((network): DataNetwork => {
    const totals = { produced: 0, downlink: 0, stored: 0, capacity: 0 };
    for (const id of network.moduleIds) {
      const module = station.modules.find((m) => m.id === id) as PlacedModule;
      const f = moduleFigures(station, module, power);
      const stored = f.stores.reduce((sum, s) => sum + s.held, 0);
      const capacity = f.stores.reduce((sum, s) => sum + s.capacity, 0);
      modules[id] = { produced: f.produced, racksWorking: f.racksWorking, racksUntended: f.racksUntended, stored, capacity, downlink: f.downlink };
      totals.produced += f.produced;
      totals.downlink += f.downlink;
      totals.stored += stored;
      totals.capacity += capacity;
    }
    return { moduleIds: network.moduleIds, ...totals };
  });
  const sum = (key: "produced" | "downlink" | "stored" | "capacity") => networks.reduce((t, n) => t + n[key], 0);
  return {
    produced: sum("produced"),
    downlink: sum("downlink"),
    stored: sum("stored"),
    capacity: sum("capacity"),
    downlinked: station.downlinked,
    lost: station.dataLost,
    contact: true,
    networks,
    modules,
  };
}

/**
 * One tick of data on every network: antennas send what they can of the
 * stored and new data, storage takes what's left, and the rest is lost.
 * Shed data storage keeps what it holds but takes and gives nothing.
 */
export function stepData(station: Station, power: PowerReport): Pick<Station, "data" | "downlinked" | "dataLost"> {
  // Start from everything held, so shed storage keeps its contents.
  const data: Record<string, number> = { ...station.data };
  let downlinked = station.downlinked;
  let dataLost = station.dataLost;

  for (const network of networksOf(station, "data")) {
    const stores: Store[] = [];
    let made = 0;
    let send = 0;
    for (const id of network.moduleIds) {
      const f = moduleFigures(station, station.modules.find((m) => m.id === id) as PlacedModule, power);
      made += f.produced * HOURS_PER_TICK;
      send += f.downlink * HOURS_PER_TICK;
      stores.push(...f.stores);
    }
    const held = stores.reduce((sum, s) => sum + s.held, 0);
    const capacity = stores.reduce((sum, s) => sum + s.capacity, 0);
    const available = held + made;
    const sent = Math.min(send, available);
    const keep = Math.min(available - sent, capacity);
    downlinked += sent;
    dataLost += available - sent - keep;
    for (const s of stores) data[s.key] = capacity > 0 ? (keep * s.capacity) / capacity : 0;
  }

  // Forget storage that no longer exists.
  for (const key of Object.keys(data)) {
    const [id, slot] = key.split(":").map(Number);
    const module = station.modules.find((m) => m.id === id);
    const equipment = module?.slots[slot as number];
    if (!equipment || !(EQUIPMENT_TYPES[equipment] as EquipmentType).dataStorage) delete data[key];
  }
  return { data, downlinked, dataLost };
}
