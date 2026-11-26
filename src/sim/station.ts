import { MODULE_TYPES, type ModuleTypeId, type Side } from "./content";

/** Only low Earth orbit exists in the prototype; GEO and sun-synchronous come with the campaign. */
export type OrbitType = "LEO";

export interface GridCell {
  x: number;
  y: number;
}

export interface PlacedModule {
  type: ModuleTypeId;
  /** Grid cell of the module's top-left corner. */
  position: GridCell;
}

export interface Station {
  orbit: OrbitType;
  modules: PlacedModule[];
}

export function createStation(): Station {
  return {
    orbit: "LEO",
    modules: [{ type: "core-node", position: { x: 0, y: 0 } }],
  };
}

/** The grid cells a placed module covers. */
export function footprintOf(module: PlacedModule): GridCell[] {
  const { width, height } = MODULE_TYPES[module.type];
  const cells: GridCell[] = [];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      cells.push({ x: module.position.x + dx, y: module.position.y + dy });
    }
  }
  return cells;
}

export interface PlacedPort {
  /** Grid cell the port belongs to. */
  x: number;
  y: number;
  side: Side;
}

/** A placed module's ports, in grid coordinates. */
export function portsOf(module: PlacedModule): PlacedPort[] {
  return MODULE_TYPES[module.type].ports.map((port) => ({
    x: module.position.x + port.x,
    y: module.position.y + port.y,
    side: port.side,
  }));
}
