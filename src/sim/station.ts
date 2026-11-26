import type { Placement } from "./geometry";

/** Only low Earth orbit exists in the prototype; GEO and sun-synchronous come with the campaign. */
export type OrbitType = "LEO";

export type ModuleId = number;

export interface PlacedModule extends Placement {
  id: ModuleId;
}

export interface Station {
  orbit: OrbitType;
  modules: PlacedModule[];
  nextModuleId: ModuleId;
  /** Earlier module layouts, most recent last, for undo. */
  history: PlacedModule[][];
}

export function createStation(): Station {
  return {
    orbit: "LEO",
    modules: [{ id: 1, type: "core-node", position: { x: 0, y: 0 }, rotation: 0 }],
    nextModuleId: 2,
    history: [],
  };
}
