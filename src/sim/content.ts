// Module types as data (spec: "content as data"), so balancing is editing numbers.

export type Side = "north" | "east" | "south" | "west";

export interface PortDefinition {
  /** Cell within the module, relative to its top-left corner (x right, y down). */
  x: number;
  y: number;
  /** The edge of that cell the port sits on. */
  side: Side;
}

export interface ModuleType {
  name: string;
  /** Size in grid cells before rotation. */
  width: number;
  height: number;
  ports: PortDefinition[];
}

export const MODULE_TYPES = {
  "core-node": {
    name: "Core node",
    width: 1,
    height: 1,
    ports: [
      { x: 0, y: 0, side: "north" },
      { x: 0, y: 0, side: "east" },
      { x: 0, y: 0, side: "south" },
      { x: 0, y: 0, side: "west" },
    ],
  },
} as const satisfies Record<string, ModuleType>;

export type ModuleTypeId = keyof typeof MODULE_TYPES;
