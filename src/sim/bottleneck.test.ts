import { describe, expect, it } from "vitest";
import {
  advance,
  applyCommand,
  createStation,
  heatOf,
  MODULE_TYPES,
  NOMINAL_TEMPERATURE,
  powerOf,
  type Command,
  type CommandResult,
  type EquipmentTypeId,
  type ConnectionFlow,
  type Station,
} from "./index";

function accepted(result: CommandResult): Station {
  if (!result.ok) throw new Error(`expected accepted, got ${result.reason}: ${result.message}`);
  return result.station;
}
const run = (station: Station, ...commands: Command[]) => commands.reduce((s, c) => accepted(applyCommand(s, c)), station);

const slot = (moduleId: number, index: number, equipment: EquipmentTypeId): Command => ({
  type: "fit",
  moduleId,
  mount: { kind: "slot", index },
  equipment,
});
const hardpoint = (moduleId: number, index: number, equipment: EquipmentTypeId): Command => ({
  type: "fit",
  moduleId,
  mount: { kind: "hardpoint", index },
  equipment,
});
const connection = (connections: ConnectionFlow[], a: number, b: number) =>
  connections.find((j) => (j.a === a && j.b === b) || (j.a === b && j.b === a));

/**
 * Core node (1), a corridor (2) east of it, and truss (3) beyond with two solar
 * panels (10.8 kW): all the power has to come through the narrow corridor.
 * A lab (4) north of the core with four lab racks, a habitat (5) south of it and
 * a life support module (6) below that with an O2 / CO2 unit.
 */
const corridor: Command = { type: "place", module: "corridor", position: { x: 1, y: 0 }, rotation: 90 };
const truss: Command = { type: "place", module: "truss", position: { x: 4, y: 0 }, rotation: 90 };
const lab: Command = { type: "place", module: "lab", position: { x: -1, y: -2 }, rotation: 0 };
const habitat: Command = { type: "place", module: "habitat", position: { x: 0, y: 1 }, rotation: 0 };
const lifeSupport: Command = { type: "place", module: "life-support", position: { x: 1, y: 4 }, rotation: 0 };
const panels = [hardpoint(3, 0, "solar-panel"), hardpoint(3, 1, "solar-panel")];
const racks = [0, 1, 2, 3].map((i) => slot(4, i, "lab-rack"));

const behindCorridor = () =>
  run(createStation(), corridor, truss, ...panels, lab, ...racks, habitat, lifeSupport, slot(6, 0, "oxygen-generator"));

describe("connection capacity", () => {
  it("is the lower of the two modules' port ratings, per resource", () => {
    const power = powerOf(behindCorridor());
    const heat = heatOf(behindCorridor());

    expect(connection(power.connections, 1, 2)?.capacity).toBe(Math.min(MODULE_TYPES["core-node"].capacity.power, MODULE_TYPES.corridor.capacity.power));
    expect(connection(power.connections, 1, 2)?.capacity).toBe(6);
    expect(connection(heat.connections, 1, 2)?.capacity).toBe(4);
    expect(connection(power.connections, 2, 3)?.capacity).toBe(6);
  });
});

describe("power through a bottleneck", () => {
  it("never carries more than a connection's capacity", () => {
    for (const j of powerOf(behindCorridor()).connections) expect(Math.abs(j.flow)).toBeLessThanOrEqual(j.capacity + 1e-9);
  });

  it("leaves the far side short even when the network has power to spare", () => {
    // 10.8 kW of sun against 7.05 kW of demand, but the corridor carries only 6.
    // Racks are shed one at a time until what's left fits.
    const power = powerOf(behindCorridor());

    expect(power.production).toBeGreaterThan(power.demand);
    // Tiers 1 to 3 behind the corridor take 3 kW; the rest of its 6 kW runs two racks.
    expect(power.modules[4]?.running.slots).toEqual([true, true, false, false]);
    expect(power.modules[6]?.running.slots[0]).toBe(true);
    expect(power.modules[4]?.shed[4]).toEqual({ kind: "bottleneck" });
  });

  it("marks the connection that limits it", () => {
    // Both corridor connections are rated 6 kW, but the truss end also carries the
    // corridor's own 0.05 kW, so that is the one that fills first.
    const connections = powerOf(behindCorridor()).connections;

    expect(connection(connections, 2, 3)?.bottleneck).toBe(true);
    expect(connections.filter((j) => j.bottleneck)).toHaveLength(1);
  });

  it("goes away with a wide enough connection: the same station with the truss straight on the core", () => {
    const direct = run(
      createStation(),
      { type: "place", module: "truss", position: { x: 1, y: 0 }, rotation: 90 },
      hardpoint(2, 0, "solar-panel"),
      hardpoint(2, 1, "solar-panel"),
      { type: "place", module: "lab", position: { x: -1, y: -2 }, rotation: 0 },
      ...[0, 1, 2, 3].map((i) => slot(3, i, "lab-rack")),
    );

    expect(powerOf(direct).supplied).toBe(true);
    expect(powerOf(direct).connections.some((j) => j.bottleneck)).toBe(false);
  });

  it("only charges batteries it can reach", () => {
    // A battery in the core, behind the corridor: it charges with whatever the corridor has left.
    const station = run(behindCorridor(), slot(1, 0, "battery"));
    const later = advance(station, 10);
    const through = connection(powerOf(later).connections, 1, 2);

    expect(powerOf(later).stored).toBeGreaterThan(0);
    expect(Math.abs(through?.flow ?? 0)).toBeLessThanOrEqual(6 + 1e-9);
  });
});

describe("heat through a bottleneck", () => {
  // Radiators out on the truss, beyond the corridor (4 kW of heat at most).
  const cooled = (station: Station) => run(station, hardpoint(3, 2, "radiator"), hardpoint(3, 3, "radiator"));
  /** Lab racks running, nothing else on the core side: 4.6 kW of heat. */
  const hotLab = () => run(createStation(), corridor, truss, ...panels, lab, ...racks);

  it("warms the modules behind a narrow connection even with radiators to spare", () => {
    const station = cooled(hotLab());
    const heat = heatOf(station);

    expect(heat.networks[0]?.capacity).toBeCloseTo(6);
    // The truss end of the corridor carries the corridor's own heat too, so it fills first.
    expect(connection(heat.connections, 2, 3)?.bottleneck).toBe(true);
    expect(heat.connections.filter((j) => j.bottleneck)).toHaveLength(1);
    expect(heatOf(advance(station, 360)).modules[4]?.temperature).toBeGreaterThan(NOMINAL_TEMPERATURE + 0.5);
  });

  it("shares a narrow connection between the modules behind it, and fully cools the near side", () => {
    const station = advance(cooled(hotLab()), 360);
    const heat = heatOf(station);
    const through = connection(heat.connections, 2, 3);

    // Fully cooled, bar a little heat leaking in from the warm corridor next door.
    expect(heat.modules[3]?.temperature).toBeLessThan(NOMINAL_TEMPERATURE + 0.5);
    expect(heat.modules[1]?.removed).toBeGreaterThan(0);
    expect(heat.modules[4]?.removed).toBeGreaterThan(0);
    expect(heat.modules[4]?.removed).toBeLessThan(heat.modules[4]?.made ?? 0);
    expect(Math.abs(through?.flow ?? 0)).toBeCloseTo(through?.capacity ?? NaN, 3);
  });
});
