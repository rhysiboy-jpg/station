// The content rules (docs/content-rules.md) that can be checked mechanically.
// Every module and equipment type, existing or new, must pass these. If a new
// part genuinely needs to break one, change the rule in the doc first, then here.
import { describe, expect, it } from "vitest";
import {
  CHALLENGES,
  CREW,
  EQUIPMENT_TYPES,
  MODULE_TYPES,
  SECONDS_PER_TICK,
  TICKS_PER_ORBIT,
  type EquipmentType,
  type ModuleType,
  type PortDefinition,
} from "./index";

const modules = Object.entries(MODULE_TYPES) as [string, ModuleType][];
const equipment = Object.entries(EQUIPMENT_TYPES) as [string, EquipmentType][];

/** Rule E1: every piece of equipment has exactly one role. Its role decides mount and priority (rules E2, E3). */
const ROLES = {
  power: { fields: ["solar"], mount: "external", priority: 1 },
  storage: { fields: ["storage"], mount: "internal", priority: 1 },
  air: { fields: ["oxygenPerDay", "co2PerDay"], mount: "internal", priority: 1 },
  water: { fields: ["recovery", "waterPerDay"], mount: "internal", priority: 2 },
  cooling: { fields: ["rejects"], mount: "external", priority: 3 },
  science: { fields: ["dataPerHour"], mount: "internal", priority: 4 },
  comms: { fields: ["downlinkPerHour"], mount: "external", priority: 4 },
  records: { fields: ["dataStorage"], mount: "internal", priority: 4 },
} as const;

function roleOf(type: EquipmentType): keyof typeof ROLES {
  const matches = (Object.keys(ROLES) as (keyof typeof ROLES)[]).filter((role) =>
    ROLES[role].fields.some((field) => (type as unknown as Record<string, unknown>)[field] !== undefined),
  );
  if (matches.length !== 1) throw new Error(`${type.name} has ${matches.length} roles: ${matches.join(", ") || "none"}`);
  return matches[0] as keyof typeof ROLES;
}

/** A point on a module's outer edge, as a key; two points with the same key share an edge. */
function edgeKey(p: PortDefinition): string {
  const offsets = { north: [0, 0, "h"], south: [0, 1, "h"], west: [0, 0, "v"], east: [1, 0, "v"] } as const;
  const [dx, dy, axis] = offsets[p.side];
  return `${p.x + dx},${p.y + dy},${axis}`;
}

function onOuterEdge(type: ModuleType, p: PortDefinition): boolean {
  const inside = p.x >= 0 && p.y >= 0 && p.x < type.width && p.y < type.height;
  const outer =
    (p.side === "north" && p.y === 0) ||
    (p.side === "south" && p.y === type.height - 1) ||
    (p.side === "west" && p.x === 0) ||
    (p.side === "east" && p.x === type.width - 1);
  return inside && outer;
}

describe("units (rule U1)", () => {
  it("one orbit is 1,200 ticks of 4.6 s, a real 92-minute low Earth orbit", () => {
    expect(TICKS_PER_ORBIT).toBe(1200);
    expect(SECONDS_PER_TICK * TICKS_PER_ORBIT).toBeCloseTo(92 * 60);
  });
});

describe("names (rule N1)", () => {
  it.each([...modules, ...equipment])("%s: id in kebab-case, short label of up to 5 capitals or digits", (id, type) => {
    expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(type.short).toMatch(/^[A-Z0-9]{2,5}$/);
  });

  it("no two parts share a name or a short label", () => {
    const names = [...modules, ...equipment].map(([, t]) => t.name);
    expect(new Set(names).size).toBe(names.length);
    const moduleShorts = modules.map(([, t]) => t.short);
    expect(new Set(moduleShorts).size).toBe(moduleShorts.length);
  });
});

describe.each(modules)("module %s", (_id, type) => {
  const cells = type.width * type.height;

  it("M1: is a whole-cell rectangle with at least one port", () => {
    expect(Number.isInteger(type.width) && type.width >= 1).toBe(true);
    expect(Number.isInteger(type.height) && type.height >= 1).toBe(true);
    expect(type.ports.length).toBeGreaterThanOrEqual(1);
  });

  it("M2: every port and hardpoint sits on its own outer edge, never sharing an edge", () => {
    const points = [...type.ports, ...type.hardpoints];
    for (const p of points) expect(onOuterEdge(type, p)).toBe(true);
    const keys = points.map(edgeKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(type.hardpoints.length).toBe(new Set(type.hardpoints.map(edgeKey)).size);
  });

  it("M3: pressurised if and only if it has volume, crew room and fans", () => {
    expect(type.volume > 0).toBe(type.pressurised);
    expect(type.maxCrew > 0).toBe(type.pressurised);
    expect(type.capacity.air > 0).toBe(type.pressurised);
  });

  it("M4: water tanks and beds only in pressurised modules; beds never exceed room", () => {
    if (!type.pressurised) {
      expect(type.waterTank).toBe(0);
      expect(type.beds).toBe(0);
    }
    expect(type.beds).toBeLessThanOrEqual(type.maxCrew);
  });

  it("M5: thermal mass is 300 kJ/°C per grid cell", () => {
    expect(type.heatCapacity).toBe(300 * cells);
  });

  it("M6: port ratings are positive, with heat never above power", () => {
    expect(type.capacity.power).toBeGreaterThan(0);
    expect(type.capacity.heat).toBeGreaterThan(0);
    expect(type.capacity.heat).toBeLessThanOrEqual(type.capacity.power);
  });

  it("M7: its own systems draw no more than 0.2 kW per cell", () => {
    expect(type.draw).toBeGreaterThanOrEqual(0);
    expect(type.draw).toBeLessThanOrEqual(0.2 * cells + 1e-9);
  });
});

describe.each(equipment)("equipment %s", (_id, type) => {
  it("E1: has exactly one role", () => {
    expect(() => roleOf(type)).not.toThrow();
  });

  it("E2: mounts where its role needs: outside for sunlight, cooling and sight of Earth, inside otherwise", () => {
    expect(type.mount).toBe(ROLES[roleOf(type)].mount);
  });

  it("E3: sheds at its role's priority tier (ADR 0004)", () => {
    expect(type.priority).toBe(ROLES[roleOf(type)].priority);
  });

  it("E4: draws power unless it is a source or a store", () => {
    const passive = roleOf(type) === "power" || roleOf(type) === "storage";
    expect(type.draw === 0).toBe(passive);
  });
});

describe("life support sizing (rule E5)", () => {
  // One unit serves one habitat's beds, with no more than 15% headroom.
  const crew = MODULE_TYPES.habitat.beds;
  const within = (value: number, need: number) => {
    expect(value).toBeGreaterThanOrEqual(need);
    expect(value).toBeLessThanOrEqual(need * 1.15 + 1e-9);
  };

  it("oxygen and CO2 for a full habitat", () => {
    within(EQUIPMENT_TYPES["oxygen-generator"].oxygenPerDay, crew * CREW.oxygenPerDay);
    within(EQUIPMENT_TYPES["oxygen-generator"].co2PerDay, crew * CREW.co2PerDay);
  });

  it("water treatment for a full habitat", () => {
    within(EQUIPMENT_TYPES["water-recycler"].waterPerDay, crew * CREW.waterPerDay);
  });
});

describe("challenges (rule C1)", () => {
  it.each(CHALLENGES.map((c) => [c.id, c] as const))("%s has a length, at least one hold or goal, and a one-line brief", (_id, c) => {
    expect(c.orbits).toBeGreaterThan(0);
    expect(c.holds.length + c.goals.length).toBeGreaterThan(0);
    expect(c.brief).toMatch(/\.$/);
    expect(c.brief.length).toBeLessThanOrEqual(100);
  });
});
