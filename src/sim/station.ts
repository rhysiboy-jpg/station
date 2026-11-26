import { MODULE_TYPES, type EquipmentTypeId } from "./content";
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
    history: [],
  };
}

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
