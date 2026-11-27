import { describe, expect, it } from "vitest";
import {
  advance,
  AIR_LIMITS,
  applyCommand,
  createStation,
  failureOf,
  heatOf,
  lifeSupportOf,
  OFFLINE_AFTER_TICKS,
  powerOf,
  TEMPERATURE_LIMITS,
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

/** Runs until `done` holds, failing at the limit. */
function advanceUntil(station: Station, done: (s: Station) => boolean, limit: number): Station {
  let current = station;
  for (let i = 0; i < limit; i++) {
    if (done(current)) return current;
    current = advance(current, 1);
  }
  throw new Error(`not reached within ${limit} ticks`);
}

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

// Core node (1); truss (2) east with two solar panels and a battery in the core;
// habitat (3) south of the core; life support module (4) south of the habitat.
const truss: Command = { type: "place", module: "truss", position: { x: 1, y: 0 }, rotation: 90 };
const habitat: Command = { type: "place", module: "habitat", position: { x: 0, y: 1 }, rotation: 0 };
const lifeSupport: Command = { type: "place", module: "life-support", position: { x: 1, y: 4 }, rotation: 0 };
const powered = [truss, onTruss(0, "solar-panel"), onTruss(1, "solar-panel"), slot(1, 0, "battery")];

/** Life support module running hot: O2 unit and recycler, no radiators anywhere. */
const hotLifeSupport = () =>
  run(createStation(), ...powered, habitat, lifeSupport, slot(4, 0, "oxygen-generator"), slot(4, 1, "water-recycler"));

const status = (s: Station, id: number) => failureOf(s).modules[id];
const isOffline = (id: number) => (s: Station) => status(s, id)?.offline === true;

describe("warnings", () => {
  it("on a new station, only say the core node has no power yet", () => {
    expect(failureOf(createStation()).warnings).toEqual([{ moduleId: 1, condition: "power", level: "red", value: 0 }]);
    expect(status(run(createStation(), ...powered), 1)?.level).toBe("ok");
  });

  it("go yellow then red as a module heats past its limits", () => {
    const yellow = advanceUntil(hotLifeSupport(), (s) => status(s, 4)?.level !== "ok", TICKS_PER_ORBIT);
    expect(status(yellow, 4)?.level).toBe("yellow");
    expect(heatOf(yellow).modules[4]?.temperature).toBeGreaterThanOrEqual(TEMPERATURE_LIMITS.yellow);
    expect(failureOf(yellow).warnings).toContainEqual(
      expect.objectContaining({ moduleId: 4, condition: "temperature", level: "yellow" }),
    );

    const red = advanceUntil(yellow, (s) => status(s, 4)?.level === "red", TICKS_PER_ORBIT);
    expect(heatOf(red).modules[4]?.temperature).toBeGreaterThanOrEqual(TEMPERATURE_LIMITS.red);
  });

  it("list red before yellow", () => {
    const station = advanceUntil(
      run(hotLifeSupport(), crew(3, 4)),
      (s) => failureOf(s).warnings.some((w) => w.level === "red"),
      TICKS_PER_ORBIT,
    );
    const levels = failureOf(station).warnings.map((w) => w.level);

    expect(levels).toEqual([...levels].sort((a, b) => (a === b ? 0 : a === "red" ? -1 : 1)));
  });

  it("show a dark module as a red power warning that never takes it offline", () => {
    // A lab with nothing to power it.
    const station = run(createStation(), { type: "place", module: "lab", position: { x: -1, y: -2 }, rotation: 0 });

    expect(failureOf(station).warnings).toContainEqual(expect.objectContaining({ moduleId: 2, condition: "power", level: "red" }));
    expect(status(advance(station, OFFLINE_AFTER_TICKS * 2), 2)?.offline).toBe(false);
  });

  it("flag bad air in an empty module without counting it down", () => {
    const station = run(createStation(), habitat);
    const stale = { ...station, air: { 2: { o2: 1, co2: 5 } } };

    expect(failureOf(stale).warnings).toContainEqual(expect.objectContaining({ moduleId: 2, condition: "co2", level: "red" }));
    expect(status(advance(stale, OFFLINE_AFTER_TICKS + 1), 2)?.offline).toBe(false);
  });
});

describe("going offline", () => {
  it("happens after a quarter orbit in red, with a countdown", () => {
    const red = advanceUntil(hotLifeSupport(), (s) => status(s, 4)?.level === "red", TICKS_PER_ORBIT * 2);

    expect(OFFLINE_AFTER_TICKS).toBe(TICKS_PER_ORBIT / 4);
    expect(status(red, 4)?.ticksToOffline).toBe(OFFLINE_AFTER_TICKS);
    expect(status(advance(red, OFFLINE_AFTER_TICKS - 1), 4)?.offline).toBe(false);
    expect(status(advance(red, OFFLINE_AFTER_TICKS), 4)?.offline).toBe(true);
  });

  it("is called off if the module drops back below red in time", () => {
    const red = advanceUntil(hotLifeSupport(), (s) => status(s, 4)?.level === "red", TICKS_PER_ORBIT * 2);
    // Set it back to the yellow limit, as if it had been cooled in time.
    const cooled = { ...red, temperature: { ...red.temperature, 4: TEMPERATURE_LIMITS.yellow } };
    const later = advance(cooled, 1);

    expect(status(later, 4)?.ticksToOffline).toBeNull();
    expect(status(advance(later, OFFLINE_AFTER_TICKS), 4)?.offline).toBe(false);
  });

  it("stops the module: no power drawn, no heat made, its equipment off", () => {
    const offline = advanceUntil(hotLifeSupport(), isOffline(4), TICKS_PER_ORBIT * 3);

    expect(powerOf(offline).modules[4]?.draw).toBe(0);
    expect(powerOf(offline).modules[4]?.running.slots).toEqual([false, false, false]);
    expect(heatOf(offline).modules[4]?.made).toBe(0);
  });

  it("moves its crew to an attached pressurised module that can hold them", () => {
    const start = run(hotLifeSupport(), crew(4, 2));
    const offline = advanceUntil(start, isOffline(4), TICKS_PER_ORBIT * 3);
    const after = advance(offline, 1);

    expect(lifeSupportOf(after).modules[4]?.crew).toBe(0);
    expect(lifeSupportOf(after).modules[3]?.crew).toBe(2);
    expect(failureOf(after).abandoned).toBe(false);
  });

  it("can't be crewed while offline", () => {
    const offline = advanceUntil(hotLifeSupport(), isOffline(4), TICKS_PER_ORBIT * 3);

    expect(applyCommand(offline, crew(4, 1))).toMatchObject({ ok: false, reason: "offline" });
  });
});

describe("recovery", () => {
  it("brings an offline module back once every reading is below yellow", () => {
    const offline = advanceUntil(hotLifeSupport(), isOffline(4), TICKS_PER_ORBIT * 3);
    // Add radiators: the loop cools the (now heatless) module back down.
    const cooling = run(offline, onTruss(3, "radiator"));
    const recovered = advanceUntil(cooling, (s) => !isOffline(4)(s), TICKS_PER_ORBIT * 2);

    expect(heatOf(recovered).modules[4]?.temperature).toBeLessThan(TEMPERATURE_LIMITS.yellow);
    expect(powerOf(recovered).modules[4]?.running.slots.slice(0, 2)).toEqual([true, true]);
  });
});

describe("abandonment", () => {
  it("happens when crew must leave and no reachable module can hold them", () => {
    // A habitat and the core node share air and water; 4 crew with no life support
    // run the 5 kg tank dry, so neither module is fit to hold them.
    const start = run(createStation(), habitat, crew(2, 4));
    const abandoned = advanceUntil(start, (s) => failureOf(s).abandoned, TICKS_PER_ORBIT * 20);

    expect(lifeSupportOf(abandoned).water.stored).toBe(0);
    expect(failureOf(abandoned).abandonedBecause).toBe("water");
    expect(lifeSupportOf(abandoned).crew).toBe(0);
    expect(failureOf(advance(abandoned, 10)).abandoned).toBe(true);
  });

  it("does not happen while somewhere fit remains", () => {
    const start = run(hotLifeSupport(), crew(4, 2));
    const later = advance(advanceUntil(start, isOffline(4), TICKS_PER_ORBIT * 3), 10);

    expect(failureOf(later).abandoned).toBe(false);
  });
});

describe("a cascade", () => {
  it("an overheating life support module goes offline, its scrubber stops, and CO2 builds where the crew live", () => {
    const start = run(hotLifeSupport(), crew(3, 4));
    const offline = advanceUntil(start, isOffline(4), TICKS_PER_ORBIT * 3);
    const co2AtFailure = lifeSupportOf(offline).modules[3]?.co2 ?? 0;
    const later = advance(offline, OFFLINE_AFTER_TICKS);

    expect(co2AtFailure).toBeLessThan(AIR_LIMITS.co2.yellow);
    expect(lifeSupportOf(later).modules[3]?.co2).toBeGreaterThan(co2AtFailure);
  });
});

describe("difficulty", () => {
  // Core node (1), corridor (2) east of it, truss (3) beyond with a solar panel.
  const corridor: Command = { type: "place", module: "corridor", position: { x: 1, y: 0 }, rotation: 90 };
  const farTruss: Command = { type: "place", module: "truss", position: { x: 4, y: 0 }, rotation: 90 };
  const panel: Command = { type: "fit", moduleId: 3, mount: { kind: "hardpoint", index: 0 }, equipment: "solar-panel" };
  /** The corridor forced red-hot so it goes offline. */
  const corridorFails = (station: Station) =>
    advanceUntil({ ...station, temperature: { 2: 45 } }, isOffline(2), OFFLINE_AFTER_TICKS + 5);

  it("is standard by default: an offline module still passes resources through", () => {
    const station = corridorFails(run(createStation(), corridor, farTruss, panel));

    expect(station.difficulty).toBe("standard");
    expect(powerOf(station).modules[1]?.powered).toBe(true);
  });

  it("on hard, an offline module cuts the networks it sits on", () => {
    const station = corridorFails(run(createStation(), corridor, farTruss, panel, { type: "difficulty", difficulty: "hard" }));

    expect(powerOf(station).modules[1]?.powered).toBe(false);
    expect(powerOf(station).modules[3]).toBeDefined();
  });
});

describe("undo after a failure", () => {
  it("is refused once the station is abandoned", () => {
    const abandoned = { ...run(createStation(), habitat, crew(2, 4)), abandoned: true, abandonedBecause: "water" as const };

    expect(applyCommand(abandoned, { type: "undo" })).toMatchObject({ ok: false, reason: "abandoned" });
  });

  it("is refused if it would put crew back into a module that is offline now", () => {
    // Crew go into the life support module, then a later build change; the module
    // overheats and goes offline, moving its crew out. Undoing the build change
    // would restore the layout from when the crew were still in it.
    const start = run(hotLifeSupport(), crew(4, 2), slot(3, 0, "lab-rack"));
    const offline = advance(advanceUntil(start, isOffline(4), TICKS_PER_ORBIT * 3), 1);

    expect(lifeSupportOf(offline).modules[4]?.crew).toBe(0);
    expect(applyCommand(offline, { type: "undo" })).toMatchObject({ ok: false, reason: "offline" });
  });

  it("still works when nothing it restores is affected", () => {
    const offline = advance(advanceUntil(run(hotLifeSupport(), slot(3, 0, "lab-rack")), isOffline(4), TICKS_PER_ORBIT * 3), 1);
    const undone = applyCommand(offline, { type: "undo" });

    expect(undone.ok).toBe(true);
    expect(undone.ok && undone.station.modules.find((m) => m.id === 3)?.slots[0]).toBeNull();
  });
});

describe("evacuating into modules with room", () => {
  const secondHabitat: Command = { type: "place", module: "habitat", position: { x: -1, y: -3 }, rotation: 180 };

  it("fills the nearest fit module up to its room, then the next", () => {
    // The habitat (room 6) already holds 5; the 2 leaving the overheating life
    // support module split: 1 into the habitat, 1 on to the core node beyond it.
    const start = run(hotLifeSupport(), secondHabitat, crew(4, 2), crew(3, 5));
    const after = advance(advanceUntil(start, isOffline(4), TICKS_PER_ORBIT * 3), 1);

    expect(lifeSupportOf(after).modules[3]?.crew).toBe(6);
    expect(lifeSupportOf(after).modules[1]?.crew).toBe(1);
    expect(failureOf(after).abandoned).toBe(false);
  });

  it("abandons the station when fit modules have no room for everyone", () => {
    // 4 crew in a red-hot habitat; the only neighbour, the core node, is fine but holds 2.
    const hot = { ...run(createStation(), habitat, crew(2, 4)), temperature: { 2: 45 } };
    const after = advanceUntil(hot, (s) => failureOf(s).abandoned, OFFLINE_AFTER_TICKS + 5);

    // The core node was fit (only its power warning is red, which never bars crew), just full.
    expect(failureOf(after).abandonedBecause).toBe("room");
    expect(lifeSupportOf(after).crew).toBe(0);
  });
});
