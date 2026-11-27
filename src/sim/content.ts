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
  /**
   * What each of its ports can carry. A joint carries the lower of its two
   * modules' ratings. Power and heat in kW; air is the fan exchange in m³/s.
   */
  capacity: { power: number; heat: number; air: number };
  /** Pressurised volume, in m³. Zero for unpressurised modules. */
  volume: number;
  /** Built-in water tank, in kg. Tanks on one water network are shared. */
  waterTank: number;
  /** Crew it can sleep. Total beds cap the station's headcount. */
  beds: number;
  /**
   * Heat needed to warm it by 1 °C, in kJ. Bigger is slower to heat up. About
   * 300 kJ/°C per cell: far below a real module's (around 10 MJ/°C), so that
   * 1 kW of unshed heat reaches the yellow limit in about an orbit, not a day.
   */
  heatCapacity: number;
}

// Port ratings: truss is the power and cooling trunk, corridors are narrow, and
// the rest sit in between. Fans swap about 0.07 m³/s between ISS modules.
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
    capacity: { power: 12, heat: 8, air: 0.07 },
    volume: 20,
    waterTank: 0,
    beds: 0,
    heatCapacity: 300,
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
    capacity: { power: 6, heat: 4, air: 0.1 },
    volume: 30,
    waterTank: 0,
    beds: 0,
    heatCapacity: 900,
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
    capacity: { power: 8, heat: 6, air: 0.07 },
    volume: 120,
    waterTank: 5,
    beds: 4,
    heatCapacity: 1800,
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
    capacity: { power: 8, heat: 6, air: 0.07 },
    volume: 40,
    waterTank: 10,
    beds: 0,
    heatCapacity: 600,
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
    capacity: { power: 8, heat: 6, air: 0.07 },
    volume: 75,
    waterTank: 0,
    beds: 0,
    heatCapacity: 1200,
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
    capacity: { power: 15, heat: 10, air: 0 },
    volume: 0,
    waterTank: 0,
    beds: 0,
    heatCapacity: 900,
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
  /** Oxygen generator / CO2 scrubber: most O2 made and CO2 removed per day, in kg. */
  oxygenPerDay?: number;
  co2PerDay?: number;
  /** Water recycler: share of used water recovered, and most it can treat per day in kg. */
  recovery?: number;
  waterPerDay?: number;
  /** Radiator: heat it can reject, in kW. */
  rejects?: number;
}

// Power figures are first estimates to balance from (design doc: start from
// real-world values, list every deviation). kW and kWh; one tick is 4.6 s.
// Priorities follow ISS-style load-shed lists: keep the crew breathing, then
// water, then cooling, and drop science and comms first.
export const EQUIPMENT_TYPES = {
  // 20 m² of panel x 1,361 W/m² sunlight x 20% efficiency = 5.4 kW.
  "solar-panel": { name: "Solar panel", short: "SOL", mount: "external", draw: 0, priority: 1, solar: 5.4 },
  // Coolant pumps.
  // Far smaller than an ISS radiator wing (about 14 kW), to suit the prototype's scale.
  radiator: { name: "Radiator", short: "RAD", mount: "external", draw: 0.2, priority: 3, rejects: 3 },
  antenna: { name: "Antenna", short: "ANT", mount: "external", draw: 0.15, priority: 4 },
  // A lithium-ion battery pack, roughly the size of one ISS battery unit.
  battery: { name: "Battery", short: "BAT", mount: "internal", draw: 0, priority: 1, storage: 5 },
  // Enough for 4 crew: 4 x 0.84 kg O2 and 4 x 1 kg CO2 a day, with some headroom.
  "oxygen-generator": {
    name: "Oxygen generator / CO2 scrubber",
    short: "O2",
    mount: "internal",
    draw: 1.5,
    priority: 1,
    oxygenPerDay: 3.6,
    co2PerDay: 4.4,
  },
  // ISS-class recovery is 93 to 98%; a first recycler sits at 90%. Treats 4 crew's water.
  "water-recycler": {
    name: "Water recycler",
    short: "H2O",
    mount: "internal",
    draw: 0.8,
    priority: 2,
    recovery: 0.9,
    waterPerDay: 12,
  },
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

/** Per person per day (design doc reference figures). Crew heat is metabolic, about 100 W. */
export const CREW = { oxygenPerDay: 0.84, co2PerDay: 1, waterPerDay: 3, heatKw: 0.1 };

/** Electrolysis: kg of water split for each kg of oxygen made. */
export const WATER_PER_KG_OXYGEN = 1.125;

/** Oxygen partial pressure of fresh air at sea level, in kPa. */
export const NOMINAL_O2_KPA = 21;

/**
 * Warning limits on air, in kPa. ISS-style: O2 kept above about 19.5 kPa,
 * CO2 below about 0.5 kPa (4 mmHg). Used by warnings (#10).
 */
export const AIR_LIMITS = {
  o2: { yellow: 19.5, red: 17 },
  co2: { yellow: 0.53, red: 1.0 },
};


/** Comfortable cabin temperature, in °C. Cooling loops pull modules back towards it. */
export const NOMINAL_TEMPERATURE = 21;

/** Temperature limits, in °C. Used by warnings (#10). */
export const TEMPERATURE_LIMITS = { yellow: 27, red: 32 };

/** Heat leaking through each joint between attached modules, in kW per °C of difference. */
export const HEAT_LEAK_KW_PER_C = 0.05;

/** How quickly a loop with spare capacity pulls a warm module back to the set point, in seconds. */
export const HEAT_RECOVERY_SECONDS = 600;

/**
 * A module that stays red this long goes offline: a quarter orbit, about 30 s
 * at 1x, so a red warning leaves time to act. Power alone never counts.
 */
export const OFFLINE_AFTER_TICKS = 300;

/** Water below this share of tank capacity is a yellow warning for crew. */
export const WATER_LOW_FRACTION = 0.25;

export type Difficulty = "standard" | "hard";

export const DIFFICULTIES: Record<Difficulty, { name: string; offlineCutsNetworks: boolean }> = {
  /** An offline module's hull still carries power, heat, air and water through to the modules beyond. */
  standard: { name: "Standard", offlineCutsNetworks: false },
  /** An offline module cuts every network it sits on, splitting the station. */
  hard: { name: "Hard", offlineCutsNetworks: true },
};
