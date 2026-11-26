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
  /** Number of internal slots for equipment. */
  slots: number;
  /** External hardpoints, each on one face of one cell. Never on the same edge as a port. */
  hardpoints: PortDefinition[];
  /** Power the module's own systems draw (lights, fans, avionics), in kW. */
  draw: number;
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
    slots: 1,
    hardpoints: [],
    draw: 0.2,
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
    slots: 0,
    hardpoints: [
      { x: 0, y: 1, side: "east" },
      { x: 0, y: 1, side: "west" },
    ],
    draw: 0.05,
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
    slots: 4,
    hardpoints: [
      { x: 0, y: 1, side: "west" },
      { x: 1, y: 1, side: "east" },
    ],
    draw: 0.6,
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
    slots: 3,
    hardpoints: [
      { x: 0, y: 0, side: "east" },
      { x: 0, y: 1, side: "west" },
    ],
    draw: 0.3,
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
    slots: 4,
    hardpoints: [
      { x: 0, y: 1, side: "west" },
      { x: 1, y: 0, side: "east" },
    ],
    draw: 0.4,
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
    slots: 0,
    hardpoints: [
      { x: 0, y: 0, side: "east" },
      { x: 0, y: 0, side: "west" },
      { x: 0, y: 2, side: "east" },
      { x: 0, y: 2, side: "west" },
    ],
    draw: 0,
  },
} as const satisfies Record<string, ModuleType>;

export type ModuleTypeId = keyof typeof MODULE_TYPES;

export type Mount = "internal" | "external";

/** Load-shedding tiers, most critical first. */
export type Priority = 1 | 2 | 3 | 4;
export const LOWEST_PRIORITY: Priority = 4;
/** A module's own systems (lights, fans, avionics) are never shed before its equipment. */
export const MODULE_SYSTEMS_PRIORITY: Priority = 1;
/**
 * How far each tier may run batteries down, as a fraction of capacity (ADR 0004).
 * Below its floor a tier is shed, leaving the rest for more critical ones, so
 * priority holds through eclipse too. Like ISS depth-of-discharge limits.
 */
export const BATTERY_FLOORS: Record<Priority, number> = { 1: 0, 2: 0.15, 3: 0.3, 4: 0.5 };

export interface EquipmentType {
  name: string;
  short: string;
  /** Internal equipment goes in slots; external equipment goes on hardpoints. */
  mount: Mount;
  /** Power drawn while running, in kW. */
  draw: number;
  /**
   * Load-shedding priority (ADR 0004): in a shortage the highest number stops first.
   * 1 life-critical, 2 life support that can wait, 3 cooling, 4 science and comms.
   */
  priority: Priority;
  /** Power made in sunlight, in kW. */
  solar?: number;
  /** Energy it can store, in kWh. */
  storage?: number;
}

// Power figures are first estimates to balance from (design doc: start from
// real-world values, list every deviation). kW and kWh; one tick is 4.6 s.
// Priorities follow ISS-style load-shed lists: keep the crew breathing, then
// water, then cooling, and drop science and comms first.
export const EQUIPMENT_TYPES = {
  // 20 m² of panel x 1,361 W/m² sunlight x 20% efficiency = 5.4 kW.
  "solar-panel": { name: "Solar panel", short: "SOL", mount: "external", draw: 0, priority: 1, solar: 5.4 },
  // Coolant pumps.
  radiator: { name: "Radiator", short: "RAD", mount: "external", draw: 0.2, priority: 3 },
  antenna: { name: "Antenna", short: "ANT", mount: "external", draw: 0.15, priority: 4 },
  // A lithium-ion battery pack, roughly the size of one ISS battery unit.
  battery: { name: "Battery", short: "BAT", mount: "internal", draw: 0, priority: 1, storage: 5 },
  "oxygen-generator": { name: "Oxygen generator / CO2 scrubber", short: "O2", mount: "internal", draw: 1.5, priority: 1 },
  "water-recycler": { name: "Water recycler", short: "H2O", mount: "internal", draw: 0.8, priority: 2 },
  "lab-rack": { name: "Lab rack", short: "LAB", mount: "internal", draw: 1, priority: 4 },
  "data-storage": { name: "Data storage", short: "DATA", mount: "internal", draw: 0.05, priority: 4 },
} as const satisfies Record<string, EquipmentType>;

export type EquipmentTypeId = keyof typeof EQUIPMENT_TYPES;

/** Things produced, stored and consumed, each moving through its own networks. */
export type Resource = "power" | "heat" | "air" | "water" | "data";

/** Every module carries power, heat and data; only pressurised modules carry air and water. */
export function carries(type: ModuleType, resource: Resource): boolean {
  return resource === "air" || resource === "water" ? type.pressurised : true;
}
