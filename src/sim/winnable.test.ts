// Every challenge can be won: each test builds a real station, lets it settle,
// starts the challenge (which locks building) and plays it out. If balance
// changes make one unwinnable, this fails.
import { describe, expect, it } from "vitest";
import {
  advance,
  applyCommand,
  CHALLENGES,
  challengeOf,
  createStation,
  TICKS_PER_ORBIT,
  type ChallengeId,
  type Command,
  type CommandResult,
  type EquipmentTypeId,
  type ModuleTypeId,
  type Rotation,
  type Station,
} from "./index";

function accepted(result: CommandResult): Station {
  if (!result.ok) throw new Error(`expected accepted, got ${result.reason}: ${result.message}`);
  return result.station;
}
const run = (station: Station, ...commands: Command[]) => commands.reduce((s, c) => accepted(applyCommand(s, c)), station);
const place = (module: ModuleTypeId, x: number, y: number, rotation: Rotation = 0): Command => ({
  type: "place",
  module,
  position: { x, y },
  rotation,
});
const slot = (moduleId: number, index: number, equipment: EquipmentTypeId): Command => ({
  type: "fit",
  moduleId,
  mount: { kind: "slot", index },
  equipment,
});
const outside = (moduleId: number, index: number, equipment: EquipmentTypeId): Command => ({
  type: "fit",
  moduleId,
  mount: { kind: "hardpoint", index },
  equipment,
});
const crew = (moduleId: number, headcount: number): Command => ({ type: "crew", moduleId, headcount });

/**
 * Let the station settle (and its batteries charge) for `settleOrbits` whole
 * orbits plus most of a day, as a player would before starting, then start
 * the challenge and play it to the end.
 */
function play(station: Station, id: ChallengeId, settleOrbits = 0) {
  const orbits = CHALLENGES.find((c) => c.id === id)?.orbits ?? 0;
  const started = run(advance(station, settleOrbits * TICKS_PER_ORBIT + 700), { type: "challenge", challenge: id });
  return challengeOf(advance(started, TICKS_PER_ORBIT * orbits + 1));
}

// Shared core: core node (1) with a battery; truss (2) east of it; habitat (3)
// south of the core (it blocks truss hardpoint 2); lab (4) north of the core.
const core = [slot(1, 0, "battery"), place("truss", 1, 0, 90), place("habitat", 0, 1), place("lab", -1, -2)];

/** Each test plays a whole challenge (thousands of ticks); CI machines can be several times slower. */
const WHOLE_GAME = { timeout: 60_000 };

describe("every challenge is winnable", WHOLE_GAME, () => {
  it("covers all of them", () => {
    expect(CHALLENGES.map((c) => c.id).sort()).toEqual(
      ["cool-running", "long-haul", "night-shift", "science-return", "shakedown", "station-keeping"].sort(),
    );
  });

  it("shakedown: a habitat with 2 crew", () => {
    const station = run(createStation(), place("habitat", 0, 1), crew(2, 2));

    expect(play(station, "shakedown")).toMatchObject({ outcome: "won" });
  });

  it("night shift: 4 racks tended by 2 crew, with power through eclipse", () => {
    const station = run(
      createStation(),
      ...core,
      outside(2, 0, "solar-panel"),
      outside(2, 1, "solar-panel"),
      outside(2, 3, "radiator"),
      outside(4, 1, "radiator"),
      ...[0, 1, 2, 3].map((i) => slot(4, i, "lab-rack")),
      slot(3, 0, "battery"),
      crew(4, 2),
    );

    expect(play(station, "night-shift")).toMatchObject({ outcome: "won" });
  });

  it("night shift really needs batteries: without them, the racks stop for the whole eclipse", () => {
    const station = run(
      createStation(),
      place("truss", 1, 0, 90),
      place("habitat", 0, 1),
      place("lab", -1, -2),
      outside(2, 0, "solar-panel"),
      outside(2, 1, "solar-panel"),
      outside(2, 3, "radiator"),
      outside(4, 1, "radiator"),
      ...[0, 1, 2, 3].map((i) => slot(4, i, "lab-rack")),
      crew(4, 2),
    );

    expect(play(station, "night-shift")).toMatchObject({ outcome: "failed" });
  });

  it("science return: a lab, data storage and an antenna", () => {
    const station = run(
      createStation(),
      ...core,
      outside(2, 0, "solar-panel"),
      outside(2, 1, "solar-panel"),
      outside(2, 3, "radiator"),
      outside(4, 1, "radiator"),
      outside(4, 0, "antenna"),
      ...[0, 1, 2, 3].map((i) => slot(4, i, "lab-rack")),
      slot(3, 0, "battery"),
      slot(3, 1, "data-storage"),
      crew(4, 2),
    );

    expect(play(station, "science-return")).toMatchObject({ outcome: "won" });
  });

  it("cool running: 6 racks and enough radiators to stay below 27 °C", () => {
    const station = run(
      createStation(),
      ...core,
      outside(2, 0, "solar-panel"),
      outside(2, 1, "solar-panel"),
      outside(2, 3, "solar-panel"),
      outside(4, 0, "radiator"),
      outside(4, 1, "radiator"),
      outside(3, 1, "radiator"),
      ...[0, 1, 2, 3].map((i) => slot(4, i, "lab-rack")),
      slot(3, 0, "battery"),
      slot(3, 1, "lab-rack"),
      slot(3, 2, "lab-rack"),
      // Racks must run all through eclipse: 15 kWh of batteries leaves 7.5 above their 50% floor.
      slot(3, 3, "battery"),
      crew(4, 2),
      crew(3, 1),
    );

    // A bigger battery bank takes a day to fill before the first night.
    const result = play(station, "cool-running", 1);
    expect(result?.failedBecause ?? null).toBeNull();
    expect(result).toMatchObject({ outcome: "won" });
  });

  it("long haul: 6 crew in two habitats either side of a life support module", () => {
    // Life support module (5) below the habitat, a second habitat (6) below that.
    const station = run(
      createStation(),
      slot(1, 0, "battery"),
      place("truss", 1, 0, 90),
      place("habitat", 0, 1),
      outside(2, 0, "solar-panel"),
      outside(2, 1, "solar-panel"),
      outside(2, 3, "radiator"),
      place("life-support", 1, 4),
      slot(4, 0, "oxygen-generator"),
      slot(4, 1, "water-recycler"),
      slot(4, 2, "battery"),
      outside(4, 0, "radiator"),
      place("habitat", 1, 6),
      crew(3, 3),
      crew(5, 3),
    );

    expect(play(station, "long-haul")).toMatchObject({ outcome: "won" });
  });

  it("station keeping: 6 crew and 8 racks, power and cooling spread so no connection is the limit", () => {
    // Core (1); truss (2) east with three solar panels; habitat (3) south; lab (4)
    // north; life support module (5) below the habitat and a second habitat (6)
    // below that, with two solar panels; a corridor (7) west to a second lab (8).
    // Radiators sit where the heat is: two on each lab, two on life support. The
    // racks must run all night, so the batteries need charge above their 50%
    // floor: solar on the battery habitat lets them charge without connections
    // getting in the way.
    const station = run(
      createStation(),
      slot(1, 0, "battery"),
      place("truss", 1, 0, 90),
      place("habitat", 0, 1),
      place("lab", -1, -2),
      place("life-support", 1, 4),
      place("habitat", 1, 6),
      place("corridor", -3, 0, 90),
      place("lab", -5, 0, 90),
      outside(2, 0, "solar-panel"),
      outside(2, 1, "solar-panel"),
      outside(2, 3, "solar-panel"),
      outside(6, 0, "solar-panel"),
      outside(6, 1, "solar-panel"),
      // Sunlight right where four batteries sit, so charging isn't held up by connections.
      outside(3, 0, "solar-panel"),
      outside(3, 1, "solar-panel"),
      outside(4, 0, "radiator"),
      outside(4, 1, "radiator"),
      outside(8, 0, "radiator"),
      outside(8, 1, "radiator"),
      outside(5, 0, "radiator"),
      outside(5, 1, "radiator"),
      // About 14 kW through a 40-minute eclipse, racks above their 50% floor: 40 kWh of batteries.
      slot(3, 0, "battery"),
      slot(3, 1, "battery"),
      slot(3, 2, "battery"),
      slot(3, 3, "battery"),
      slot(6, 0, "battery"),
      slot(6, 1, "battery"),
      slot(6, 2, "battery"),
      slot(5, 0, "oxygen-generator"),
      slot(5, 1, "water-recycler"),
      slot(5, 2, "battery"),
      ...[0, 1, 2, 3].map((i) => slot(4, i, "lab-rack")),
      ...[0, 1, 2, 3].map((i) => slot(8, i, "lab-rack")),
      crew(4, 2),
      crew(8, 2),
      crew(3, 1),
      crew(6, 1),
    );

    // A big battery bank takes a few days to fill before the challenge.
    const result = play(station, "station-keeping", 3);
    expect(result?.failedBecause ?? null).toBeNull();
    expect(result).toMatchObject({ outcome: "won" });
  });
});
