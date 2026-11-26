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
  /** Short label drawn on the module. */
  short: string;
  /** Size in grid cells before rotation. */
  width: number;
  height: number;
  /** Holds air and crew. Only pressurised modules join the air network. */
  pressurised: boolean;
  ports: PortDefinition[];
}

// Sizes follow the design doc (1x1 node, 1x3 corridor, 2x3 habitat). Ports are
// listed for rotation 0; a module rotates as a whole in 90 degree steps.
export const MODULE_TYPES = {
  "core-node": {
    name: "Core node",
    short: "NODE",
    width: 1,
    height: 1,
    pressurised: true,
    ports: [
      { x: 0, y: 0, side: "north" },
      { x: 0, y: 0, side: "east" },
      { x: 0, y: 0, side: "south" },
      { x: 0, y: 0, side: "west" },
    ],
  },
  corridor: {
    name: "Corridor",
    short: "CORR",
    width: 1,
    height: 3,
    pressurised: true,
    ports: [
      { x: 0, y: 0, side: "north" },
      { x: 0, y: 2, side: "south" },
    ],
  },
  habitat: {
    name: "Habitat",
    short: "HAB",
    width: 2,
    height: 3,
    pressurised: true,
    ports: [
      { x: 0, y: 0, side: "north" },
      { x: 1, y: 2, side: "south" },
    ],
  },
  "life-support": {
    name: "Life support module",
    short: "LSS",
    width: 1,
    height: 2,
    pressurised: true,
    ports: [
      { x: 0, y: 0, side: "north" },
      { x: 0, y: 1, side: "south" },
    ],
  },
  lab: {
    name: "Lab",
    short: "LAB",
    width: 2,
    height: 2,
    pressurised: true,
    ports: [
      { x: 0, y: 0, side: "north" },
      { x: 1, y: 1, side: "south" },
    ],
  },
  truss: {
    name: "Truss segment",
    short: "TRUSS",
    width: 1,
    height: 3,
    pressurised: false,
    ports: [
      { x: 0, y: 0, side: "north" },
      { x: 0, y: 1, side: "east" },
      { x: 0, y: 2, side: "south" },
      { x: 0, y: 1, side: "west" },
    ],
  },
} as const satisfies Record<string, ModuleType>;

export type ModuleTypeId = keyof typeof MODULE_TYPES;
