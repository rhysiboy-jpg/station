import { describe, expect, it } from "vitest";
import {
  advance,
  applyCommand,
  createStation,
  dataOf,
  EQUIPMENT_TYPES,
  SECONDS_PER_TICK,
  type Command,
  type CommandResult,
  type EquipmentTypeId,
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
const onTruss = (index: number, equipment: EquipmentTypeId): Command => ({
  type: "fit",
  moduleId: 2,
  mount: { kind: "hardpoint", index },
  equipment,
});
const crew = (moduleId: number, headcount: number): Command => ({ type: "crew", moduleId, headcount });

const HOURS_PER_TICK = SECONDS_PER_TICK / 3600;
const RACK = EQUIPMENT_TYPES["lab-rack"].dataPerHour;
const ANTENNA = EQUIPMENT_TYPES.antenna.downlinkPerHour;

// Core node (1); truss (2) east with two solar panels (10.8 kW, plenty in day);
// lab (3) north with four lab racks; habitat (4) south for beds, holding the
// data storage. Hardpoint 2 on the truss is blocked by the habitat.
const base = [
  { type: "place", module: "truss", position: { x: 1, y: 0 }, rotation: 90 } as Command,
  onTruss(0, "solar-panel"),
  onTruss(1, "solar-panel"),
  { type: "place", module: "lab", position: { x: -1, y: -2 }, rotation: 0 } as Command,
  ...[0, 1, 2, 3].map((i) => slot(3, i, "lab-rack")),
  { type: "place", module: "habitat", position: { x: 0, y: 1 }, rotation: 0 } as Command,
  slot(4, 0, "data-storage"),
];
const lab = (crewed: number, ...more: Command[]) => run(createStation(), ...base, crew(3, crewed), ...more);

describe("lab racks", () => {
  it("make data only with crew to tend them: each crew member tends two racks", () => {
    expect(dataOf(lab(0)).produced).toBe(0);
    expect(dataOf(lab(1)).produced).toBeCloseTo(2 * RACK);
    expect(dataOf(lab(2)).produced).toBeCloseTo(4 * RACK);
    expect(dataOf(lab(3)).produced).toBeCloseTo(4 * RACK);
  });

  it("make nothing without power", () => {
    const dark = run(createStation(), ...base.filter((c) => !(c.type === "fit" && c.equipment === "solar-panel")), crew(3, 2));

    expect(dataOf(dark).produced).toBe(0);
  });

  it("fill data storage when nothing sends it down", () => {
    const station = advance(lab(2), 100);

    expect(dataOf(station).stored).toBeCloseTo(4 * RACK * HOURS_PER_TICK * 100, 6);
    expect(dataOf(station).capacity).toBe(EQUIPMENT_TYPES["data-storage"].dataStorage);
  });
});

describe("data storage", () => {
  it("loses whatever won't fit, and counts it", () => {
    const nearlyFull = { ...lab(2), data: { "4:0": 19.9 } };
    const later = advance(nearlyFull, 100);
    const made = 4 * RACK * HOURS_PER_TICK * 100;

    expect(dataOf(later).stored).toBeCloseTo(20, 6);
    expect(dataOf(later).lost).toBeCloseTo(made - 0.1, 6);
  });

  it("loses everything with no storage and no antenna", () => {
    const later = advance(run(createStation(), ...base.filter((c) => c.type !== "fit" || c.equipment !== "data-storage"), crew(3, 2)), 10);

    expect(dataOf(later).capacity).toBe(0);
    expect(dataOf(later).lost).toBeCloseTo(4 * RACK * HOURS_PER_TICK * 10, 6);
  });
});

describe("antennas", () => {
  it("send data to Earth up to their rate, with the rest stored", () => {
    // 4 GB/h made, one antenna sends 3 GB/h; truss carries the data out to it.
    const station = advance(lab(2, onTruss(3, "antenna")), 360);
    const hours = HOURS_PER_TICK * 360;

    expect(dataOf(station).downlinked).toBeCloseTo(ANTENNA * hours, 6);
    expect(dataOf(station).stored).toBeCloseTo((4 * RACK - ANTENNA) * hours, 6);
  });

  it("empty stored data while the racks are idle", () => {
    const stocked = { ...lab(0, onTruss(3, "antenna")), data: { "4:0": 10 } };
    const later = advance(stocked, 100);

    expect(dataOf(later).stored).toBeCloseTo(10 - ANTENNA * HOURS_PER_TICK * 100, 6);
  });

  it("send nothing without power", () => {
    const stocked = { ...run(createStation(), ...base.filter((c) => !(c.type === "fit" && c.equipment === "solar-panel")), onTruss(3, "antenna")), data: { "4:0": 10 } };

    expect(dataOf(advance(stocked, 10)).downlinked).toBe(0);
  });

  it("always have ground contact in the prototype", () => {
    expect(dataOf(createStation()).contact).toBe(true);
  });
});
