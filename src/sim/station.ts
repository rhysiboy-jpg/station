import { DIFFICULTIES, MODULE_TYPES, type ChallengeId, type Difficulty, type EquipmentTypeId } from "./content";
import type { Placement } from "./geometry";

/** Only low Earth orbit exists in the prototype; GEO and sun-synchronous come with the campaign. */
export type OrbitType = "LEO";

export type ModuleId = number;

export interface PlacedModule extends Placement {
  id: ModuleId;
  /** Equipment in each internal slot, in the module type's slot order. */
  slots: (EquipmentTypeId | null)[];
  /** Equipment on each hardpoint, in the module type's hardpoint order. */
  hardpoints: (EquipmentTypeId | null)[];
  /** Crew assigned here. A build choice, so it lives with the layout and undoes with it. */
  crew: number;
}

/** A challenge in progress or finished on this station. */
export interface ChallengeRun {
  id: ChallengeId;
  startTick: number;
  /** GB already sent when it began, so goals count only what comes after. */
  downlinkedAtStart: number;
  /** Ticks each hold has currently been unmet in a row. */
  lapses: number[];
  outcome: "running" | "won" | "failed";
  endedTick: number | null;
  failedBecause: string | null;
}

/** A module's atmosphere, in kg of each gas. */
export interface Air {
  o2: number;
  co2: number;
}

export interface Station {
  orbit: OrbitType;
  /** Ticks run since the station was created. */
  tick: number;
  modules: PlacedModule[];
  nextModuleId: ModuleId;
  /** Charge in each battery, in kWh, keyed by module and slot. */
  batteries: Record<string, number>;
  /**
   * The load-shedding tier each module's power network ran at last tick
   * (ADR 0004). Missing means nothing has been shed.
   */
  powerRunningUpTo: Record<ModuleId, number>;
  // Running state keyed by module, like batteries, so undoing a build change
  // doesn't rewind time. A module with no entry is fresh: fresh air, full
  // tank, at the set point.
  /** Each pressurised module's air. */
  air: Record<ModuleId, Air>;
  /** Water in each module's tank, in kg. */
  water: Record<ModuleId, number>;
  /** Each module's temperature, in °C. */
  temperature: Record<ModuleId, number>;
  /** GB held in each data storage unit, keyed by module and slot. */
  data: Record<string, number>;
  /** GB sent to Earth since the station was created. */
  downlinked: number;
  /** GB made that had nowhere to go. */
  dataLost: number;
  /** The challenge being played, or null for free play. */
  challenge: ChallengeRun | null;
  /** Ticks each module has spent in red on a condition that counts towards going offline. */
  redTicks: Record<ModuleId, number>;
  /** Modules that are offline: they make, use and hold nothing until they recover. */
  offline: ModuleId[];
  /** Everyone has left. The only game over. */
  abandoned: boolean;
  /** What drove the crew out of the last module they had to leave, once abandoned. */
  abandonedBecause: "temperature" | "o2" | "co2" | "water" | null;
  difficulty: Difficulty;
  /** Earlier module layouts, most recent last, for undo. */
  history: PlacedModule[][];
}

export function createStation(): Station {
  return {
    orbit: "LEO",
    tick: 0,
    modules: [newModule(1, { type: "core-node", position: { x: 0, y: 0 }, rotation: 0 })],
    nextModuleId: 2,
    batteries: {},
    powerRunningUpTo: {},
    air: {},
    water: {},
    temperature: {},
    data: {},
    downlinked: 0,
    dataLost: 0,
    challenge: null,
    redTicks: {},
    offline: [],
    abandoned: false,
    abandonedBecause: null,
    difficulty: "standard",
    history: [],
  };
}

export const isOffline = (station: Station, id: ModuleId) => station.offline.includes(id);

/** Whether an offline module still carries resources through, by the station's difficulty. */
export const offlineCutsNetworks = (station: Station) => DIFFICULTIES[station.difficulty].offlineCutsNetworks;

export const crewOf = (modules: PlacedModule[]) => modules.reduce((sum, m) => sum + m.crew, 0);
export const bedsOf = (modules: PlacedModule[]) => modules.reduce((sum, m) => sum + MODULE_TYPES[m.type].beds, 0);

/** A freshly built module with all its mounts empty. */
export function newModule(id: ModuleId, placement: Placement): PlacedModule {
  const type = MODULE_TYPES[placement.type];
  return {
    id,
    ...placement,
    slots: Array.from({ length: type.slots }, () => null),
    hardpoints: type.hardpoints.map(() => null),
    crew: 0,
  };
}
