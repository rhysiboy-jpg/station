import { describe, expect, it } from "vitest";
import {
  advance,
  applyCommand,
  createStation,
  heatOf,
  NOMINAL_TEMPERATURE,
  TICKS_PER_ORBIT,
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

// Core node (1), truss (2) east of it with solar on hardpoints 0 and 1 and
// radiators on 2 and 3, lab (3) north of the core, habitat south of it.
const truss: Command = { type: "place", module: "truss", position: { x: 1, y: 0 }, rotation: 90 };
const lab: Command = { type: "place", module: "lab", position: { x: -1, y: -2 }, rotation: 0 };
const habitat: Command = { type: "place", module: "habitat", position: { x: 0, y: 1 }, rotation: 0 };
const onTruss = (index: number, equipment: EquipmentTypeId): Command => ({
  type: "fit",
  moduleId: 2,
  mount: { kind: "hardpoint", index },
  equipment,
});
const slot = (moduleId: number, index: number, equipment: EquipmentTypeId): Command => ({
  type: "fit",
  moduleId,
  mount: { kind: "slot", index },
  equipment,
});
const labRacks = [0, 1, 2, 3].map((i) => slot(3, i, "lab-rack"));
/** Run in daylight only, so power (and so heat) is steady. */
const HALF_DAY = 360;
const temperature = (station: Station, id: number) => heatOf(station).modules[id]?.temperature ?? NaN;

describe("module temperature", () => {
  it("starts at the comfortable set point", () => {
    expect(temperature(createStation(), 1)).toBe(NOMINAL_TEMPERATURE);
  });

  it("rises when powered equipment runs with no radiator to shed its heat", () => {
    const station = run(createStation(), truss, onTruss(0, "solar-panel"), onTruss(1, "solar-panel"), lab, ...labRacks);

    expect(heatOf(station).modules[3]?.made).toBeCloseTo(4.4);
    expect(temperature(advance(station, HALF_DAY), 3)).toBeGreaterThan(NOMINAL_TEMPERATURE + 2);
  });

  it("stays at the set point when radiators can carry the heat away", () => {
    const station = run(
      createStation(),
      truss,
      onTruss(0, "solar-panel"),
      onTruss(1, "solar-panel"),
      onTruss(2, "radiator"),
      onTruss(3, "radiator"),
      lab,
      ...labRacks,
    );

    expect(temperature(advance(station, HALF_DAY), 3)).toBeCloseTo(NOMINAL_TEMPERATURE, 1);
  });

  it("is not helped by a radiator without power", () => {
    const station = run(createStation(), truss, onTruss(2, "radiator"), onTruss(3, "radiator"));
    const crewed = run(station, habitat, { type: "crew", moduleId: 3, headcount: 4 });

    expect(temperature(advance(crewed, HALF_DAY), 3)).toBeGreaterThan(NOMINAL_TEMPERATURE);
  });

  it("rises with crew aboard, who make heat too", () => {
    const station = run(createStation(), habitat, { type: "crew", moduleId: 2, headcount: 4 });

    expect(heatOf(station).modules[2]?.made).toBeCloseTo(0.4);
  });

  it("rises fastest in the modules making the most heat when the loop can't keep up", () => {
    // One radiator (3 kW) against about 5.2 kW of load: everyone keeps a share of their own heat.
    const station = run(
      createStation(),
      truss,
      onTruss(0, "solar-panel"),
      onTruss(1, "solar-panel"),
      onTruss(3, "radiator"), // hardpoint 2 would be blocked by the habitat
      lab,
      ...labRacks,
      habitat,
    );
    expect(heatOf(station).networks[0]?.capacity).toBeCloseTo(3);
    const later = advance(station, HALF_DAY);

    expect(temperature(later, 3)).toBeGreaterThan(temperature(later, 4));
    expect(temperature(later, 4)).toBeGreaterThan(NOMINAL_TEMPERATURE);
  });

  it("leaks a little into directly attached modules", () => {
    // Without radiators the loop moves nothing, so only leakage couples modules.
    // The core node sits between the hot lab and the habitat.
    const base = [truss, onTruss(0, "solar-panel"), onTruss(1, "solar-panel"), lab, habitat];
    const hotLab = advance(run(createStation(), ...base, ...labRacks), HALF_DAY);
    const coolLab = advance(run(createStation(), ...base), HALF_DAY);

    expect(temperature(hotLab, 1)).toBeGreaterThan(temperature(coolLab, 1) + 0.5);
    expect(temperature(hotLab, 3) - temperature(hotLab, 1)).toBeGreaterThan(1);
  });

  it("is carried through truss to radiators hung on it", () => {
    const station = run(
      createStation(),
      truss,
      onTruss(0, "solar-panel"),
      onTruss(1, "solar-panel"),
      onTruss(2, "radiator"),
      onTruss(3, "radiator"),
      lab,
      ...labRacks,
    );

    expect(heatOf(station).networks).toHaveLength(1);
    expect(heatOf(station).networks[0]?.capacity).toBeCloseTo(6);
  });

  it("goes nowhere when equipment is shed, which makes no heat", () => {
    // No power at all: nothing runs, nothing heats.
    const station = advance(run(createStation(), truss, lab, ...labRacks), TICKS_PER_ORBIT);

    expect(temperature(station, 3)).toBe(NOMINAL_TEMPERATURE);
  });
});
