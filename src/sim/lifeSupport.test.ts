import { describe, expect, it } from "vitest";
import {
  advance,
  AIR_LIMITS,
  applyCommand,
  createStation,
  lifeSupportOf,
  NOMINAL_O2_KPA,
  MODULE_TYPES,
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

// Layout: core node (1) at the origin; truss (2) east of it with solar panels;
// habitat (3) south of the core; life support module (4) south of the habitat.
const truss: Command = { type: "place", module: "truss", position: { x: 1, y: 0 }, rotation: 90 };
const habitat: Command = { type: "place", module: "habitat", position: { x: 0, y: 1 }, rotation: 0 };
const lifeSupport: Command = { type: "place", module: "life-support", position: { x: 1, y: 4 }, rotation: 0 };
const solar = (index: number): Command => ({ type: "fit", moduleId: 2, mount: { kind: "hardpoint", index }, equipment: "solar-panel" });
const fit = (moduleId: number, index: number, equipment: EquipmentTypeId): Command => ({
  type: "fit",
  moduleId,
  mount: { kind: "slot", index },
  equipment,
});
const crew = (moduleId: number, headcount: number): Command => ({ type: "crew", moduleId, headcount });

/** Power for the whole orbit: two panels and a battery in the core node. */
const powered = [truss, solar(0), solar(1), fit(1, 0, "battery")];

describe("crew headcount", () => {
  it("can be assigned up to the beds the station's habitats provide", () => {
    const station = run(createStation(), habitat, crew(2, 4));

    expect(lifeSupportOf(station).crew).toBe(4);
    expect(lifeSupportOf(station).beds).toBe(4);
    expect(applyCommand(station, crew(1, 1))).toMatchObject({ ok: false, reason: "no-beds" });
  });

  it("can work in any pressurised module, not just a habitat", () => {
    const station = run(createStation(), habitat, crew(2, 2), crew(1, 2));

    expect(lifeSupportOf(station).modules[1]?.crew).toBe(2);
  });

  it("is limited by each module's room, as well as by beds", () => {
    // Two habitats give 8 beds, but the core node only has room for 2.
    const station = run(
      createStation(),
      habitat,
      { type: "place", module: "habitat", position: { x: -1, y: -3 }, rotation: 180 },
    );

    expect(MODULE_TYPES["core-node"].maxCrew).toBe(2);
    expect(applyCommand(station, crew(1, 3))).toMatchObject({ ok: false, reason: "no-room" });
    expect(applyCommand(station, crew(1, 2)).ok).toBe(true);
  });

  it("is rejected without a habitat to sleep in", () => {
    expect(applyCommand(createStation(), crew(1, 1))).toMatchObject({ ok: false, reason: "no-beds" });
  });

  it("is rejected in unpressurised modules", () => {
    expect(applyCommand(run(createStation(), habitat, truss), crew(3, 1))).toMatchObject({ ok: false, reason: "unpressurised" });
  });

  it("must be moved out before a crewed module is removed", () => {
    const station = run(createStation(), habitat, crew(2, 1));

    expect(applyCommand(station, { type: "remove", moduleId: 2 })).toMatchObject({ ok: false, reason: "crew-aboard" });
  });

  it("is undoable like any other build change", () => {
    const station = run(createStation(), habitat, crew(2, 3), { type: "undo" });

    expect(lifeSupportOf(station).crew).toBe(0);
  });
});

describe("air", () => {
  it("starts at sea-level oxygen and no CO2 in a new module", () => {
    const air = lifeSupportOf(run(createStation(), habitat)).modules[2];

    expect(air?.o2).toBeCloseTo(NOMINAL_O2_KPA, 1);
    expect(air?.co2).toBe(0);
  });

  it("without a scrubber, CO2 from 4 crew passes the yellow limit within a few orbits", () => {
    // Real figures: about 1 kg CO2 per person per day.
    const start = run(createStation(), habitat, crew(2, 4));
    const afterOne = lifeSupportOf(advance(start, TICKS_PER_ORBIT)).modules[2];
    const afterSix = lifeSupportOf(advance(start, TICKS_PER_ORBIT * 6)).modules[2];

    expect(afterOne?.co2).toBeLessThan(AIR_LIMITS.co2.yellow);
    expect(afterSix?.co2).toBeGreaterThan(AIR_LIMITS.co2.yellow);
  });

  it("without an oxygen generator, oxygen falls far more slowly than CO2 builds", () => {
    const air = lifeSupportOf(advance(run(createStation(), habitat, crew(2, 4)), TICKS_PER_ORBIT * 6)).modules[2];

    expect(air?.o2).toBeLessThan(NOMINAL_O2_KPA);
    expect(air?.o2).toBeGreaterThan(AIR_LIMITS.o2.yellow);
  });

  it("a powered oxygen generator / CO2 scrubber keeps the air good for 4 crew", () => {
    const station = advance(
      run(createStation(), ...powered, habitat, lifeSupport, fit(4, 0, "oxygen-generator"), crew(3, 4)),
      TICKS_PER_ORBIT * 6,
    );
    const air = lifeSupportOf(station).modules[3];

    expect(air?.co2).toBeLessThan(AIR_LIMITS.co2.yellow);
    expect(air?.o2).toBeGreaterThan(AIR_LIMITS.o2.yellow);
  });

  it("does nothing without power", () => {
    const base = [habitat, lifeSupport, crew(2, 4)];
    const unpowered = advance(run(createStation(), ...base, fit(3, 0, "oxygen-generator")), TICKS_PER_ORBIT * 2);
    const absent = advance(run(createStation(), ...base), TICKS_PER_ORBIT * 2);

    expect(lifeSupportOf(unpowered).modules).toEqual(lifeSupportOf(absent).modules);
    expect(lifeSupportOf(unpowered).water).toEqual(lifeSupportOf(absent).water);
  });

  it("mixes slowly between connected modules, so air is worst where the crew are and furthest from the scrubber", () => {
    const station = advance(
      run(createStation(), ...powered, habitat, lifeSupport, fit(4, 0, "oxygen-generator"), crew(3, 4)),
      TICKS_PER_ORBIT,
    );
    const air = lifeSupportOf(station).modules;

    expect(air[3]?.co2).toBeGreaterThan(air[4]?.co2 ?? Infinity);
    expect(air[1]?.co2).toBeGreaterThan(0);
  });

  it("does not pass through truss", () => {
    // A habitat hung off the far end of the truss shares no air with the core.
    const farHabitat: Command = { type: "place", module: "habitat", position: { x: 4, y: -1 }, rotation: 270 };
    const station = advance(run(createStation(), truss, farHabitat, crew(3, 4)), TICKS_PER_ORBIT);

    expect(lifeSupportOf(station).modules[3]?.co2).toBeGreaterThan(0);
    expect(lifeSupportOf(station).modules[1]?.co2).toBe(0);
  });
});

describe("water", () => {
  it("is held in tanks that connected pressurised modules share", () => {
    const water = lifeSupportOf(run(createStation(), habitat, lifeSupport)).water;

    expect(water.networks).toHaveLength(1);
    expect(water.stored).toBeGreaterThan(0);
    expect(water.stored).toBe(water.capacity);
  });

  it("is drunk at about 0.77 kg an orbit by 4 crew, so 15 kg of tanks last about 20 orbits", () => {
    // 4 x 3 kg a day, and a day is about 15.65 orbits. (Bad air ends this station
    // before the water runs out; failure.test.ts covers that.)
    const start = run(createStation(), habitat, lifeSupport, crew(2, 4));
    const used = 15 - lifeSupportOf(advance(start, TICKS_PER_ORBIT * 5)).water.stored;

    expect(used / 5).toBeCloseTo((4 * 3 * 92) / (24 * 60), 2);
  });

  it("lasts far longer with a powered recycler, which still loses part of what it treats", () => {
    const base = [...powered, habitat, lifeSupport, crew(3, 4)];
    const without = lifeSupportOf(advance(run(createStation(), ...base), TICKS_PER_ORBIT * 3)).water.stored;
    const withRecycler = lifeSupportOf(
      advance(run(createStation(), ...base, fit(4, 0, "water-recycler")), TICKS_PER_ORBIT * 3),
    ).water;

    expect(withRecycler.stored).toBeGreaterThan(without);
    expect(withRecycler.stored).toBeLessThan(withRecycler.capacity);
  });

  it("is used by the oxygen generator to make oxygen", () => {
    const base = [...powered, habitat, lifeSupport, crew(3, 4)];
    const recyclerOnly = run(createStation(), ...base, fit(4, 0, "water-recycler"));
    const withGenerator = run(recyclerOnly, fit(4, 1, "oxygen-generator"));

    expect(lifeSupportOf(advance(withGenerator, TICKS_PER_ORBIT)).water.stored).toBeLessThan(
      lifeSupportOf(advance(recyclerOnly, TICKS_PER_ORBIT)).water.stored,
    );
  });
});
