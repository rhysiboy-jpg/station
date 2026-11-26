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
    history: [],
  };
}

/** A freshly built module with all its mounts empty. */
export function newModule(id: ModuleId, placement: Placement): PlacedModule {
  const type = MODULE_TYPES[placement.type];
  return {
    id,
    ...placement,
    slots: Array.from({ length: type.slots }, () => null),
    hardpoints: type.hardpoints.map(() => null),
  };
}
