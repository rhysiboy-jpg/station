import { describe, expect, it } from "vitest";
import {
  advance,
  BATTERY_FLOORS,
  applyCommand,
  createStation,
  networksOf,
  orbitOf,
  powerOf,
  type Command,
  type Station,
} from "./index";

function run(station: Station, ...commands: Command[]): Station {
  return commands.reduce((s, c) => {
    const result = applyCommand(s, c);
    if (!result.ok) throw new Error(`${c.type} rejected: ${result.message}`);
    return result.station;
  }, station);
}

const DAY = 720;
const ECLIPSE = 480;

/** Core node (id 1) with a truss (id 2) running east from it, cells (1,0) to (3,0). */
const truss: Command = { type: "place", module: "truss", position: { x: 1, y: 0 }, rotation: 90 };
const solar: Command = { type: "fit", moduleId: 2, mount: { kind: "hardpoint", index: 0 }, equipment: "solar-panel" };
const battery: Command = { type: "fit", moduleId: 1, mount: { kind: "slot", index: 0 }, equipment: "battery" };

describe("the power network", () => {
  it("joins every connected module, and is recomputed when the layout changes", () => {
    const before = createStation();
    const after = run(before, truss);

    expect(networksOf(before, "power").map((n) => n.moduleIds)).toEqual([[1]]);
    expect(networksOf(after, "power").map((n) => n.moduleIds)).toEqual([[1, 2]]);
  });
});

describe("solar panels", () => {
  it("make 5.4 kW in day, from 20 m² at 20% efficiency in 1,361 W/m² sunlight", () => {
    expect(powerOf(run(createStation(), truss, solar)).production).toBeCloseTo(5.4);
  });

  it("make nothing in eclipse", () => {
    const station = advance(run(createStation(), truss, solar), DAY);

    expect(orbitOf(station).phase).toBe("eclipse");
    expect(powerOf(station).production).toBe(0);
  });
});

describe("modules", () => {
  it("draw power for their own systems, plus whatever equipment they hold", () => {
    const bare = powerOf(run(createStation(), truss)).demand;
    const withLabRack = powerOf(
      run(createStation(), truss, { type: "fit", moduleId: 1, mount: { kind: "slot", index: 0 }, equipment: "lab-rack" }),
    ).demand;

    expect(bare).toBeGreaterThan(0);
    expect(withLabRack).toBeGreaterThan(bare);
  });
});

describe("batteries", () => {
  it("charge from surplus during day", () => {
    const station = advance(run(createStation(), truss, solar, battery), 100);

    expect(powerOf(station).stored).toBeGreaterThan(0);
  });

  it("stop charging when full", () => {
    const station = advance(run(createStation(), truss, solar, battery), DAY * 3);

    expect(powerOf(station).stored).toBeLessThanOrEqual(powerOf(station).capacity);
    expect(powerOf(station).capacity).toBeGreaterThan(0);
  });

  it("carry the station through eclipse", () => {
    const station = advance(run(createStation(), truss, solar, battery), DAY + ECLIPSE - 1);

    expect(orbitOf(station).phase).toBe("eclipse");
    expect(powerOf(station).powered).toBe(true);
    expect(powerOf(station).stored).toBeLessThan(powerOf(advance(run(createStation(), truss, solar, battery), DAY)).stored);
  });
});

describe("without enough power", () => {
  it("a station with solar but no battery goes unpowered in eclipse", () => {
    const station = advance(run(createStation(), truss, solar), DAY + 10);

    expect(powerOf(station).powered).toBe(false);
    expect(powerOf(station).modules[1]?.powered).toBe(false);
  });

  it("comes back once the sun does", () => {
    const station = advance(run(createStation(), truss, solar), DAY + ECLIPSE + 10);

    expect(powerOf(station).powered).toBe(true);
  });

  it("a station with no power source is unpowered from the start", () => {
    expect(powerOf(createStation()).powered).toBe(false);
  });

  it("is judged on the current layout, without waiting for a tick", () => {
    const unpowered = advance(createStation(), 10);

    expect(powerOf(run(unpowered, truss, solar)).powered).toBe(true);
  });
});

describe("load shedding (ADR 0004)", () => {
  // Core node (1), truss (2) with one 5.4 kW panel, a life support module (3)
  // south of the core and a lab (4) north of it.
  const lifeSupport: Command = { type: "place", module: "life-support", position: { x: 0, y: 1 }, rotation: 0 };
  const lab: Command = { type: "place", module: "lab", position: { x: -1, y: -2 }, rotation: 0 };
  const fit = (moduleId: number, index: number, equipment: "oxygen-generator" | "water-recycler" | "lab-rack" | "battery"): Command => ({
    type: "fit",
    moduleId,
    mount: { kind: "slot", index },
    equipment,
  });
  const labRacks = [0, 1, 2, 3].map((i) => fit(4, i, "lab-rack"));

  /** Runs until `done` holds, failing if `never` holds first or the limit is reached. */
  function advanceUntil(station: Station, done: (s: Station) => boolean, never: (s: Station) => boolean, limit: number): Station {
    let current = station;
    for (let i = 0; i < limit; i++) {
      if (done(current)) return current;
      if (never(current)) throw new Error(`unexpected state at tick ${current.tick}`);
      current = advance(current, 1);
    }
    throw new Error(`not reached within ${limit} ticks`);
  }
  const labsRunning = (s: Station) => powerOf(s).modules[4]?.running.slots.every(Boolean) ?? false;

  it("stops the lowest priority equipment first and keeps life support running", () => {
    // Demand 8.2 kW against 5.4 kW of sun. Tiers 1 to 3 take 3.2 kW; the 2.2 kW
    // left runs lab racks one at a time, in slot order: the life support
    // module's rack, then one of the lab's four.
    const station = run(
      createStation(),
      truss,
      solar,
      lifeSupport,
      lab,
      fit(3, 0, "oxygen-generator"),
      fit(3, 1, "water-recycler"),
      fit(3, 2, "lab-rack"),
      ...labRacks,
    );
    const power = powerOf(station);

    expect(power.demand).toBeCloseTo(8.2);
    expect(power.modules[3]?.running.slots).toEqual([true, true, true]);
    expect(power.modules[4]?.running.slots).toEqual([true, false, false, false]);
    expect(power.modules[4]?.powered).toBe(true);
    expect(power.powered).toBe(true);
    expect(power.supplied).toBe(false);
    expect(power.draw).toBeCloseTo(5.2);
  });

  // 5.4 kW of sun. Life support module (3) with a water recycler, a radiator
  // on the truss, and the lab's four racks as the only tier 4 load. Without
  // the racks the station draws 1.9 kW, leaving 3.5 kW to charge the core's
  // battery: not enough for the racks' 4 kW.
  const radiator: Command = { type: "fit", moduleId: 2, mount: { kind: "hardpoint", index: 1 }, equipment: "radiator" };
  const sheddingWithBattery = () =>
    run(createStation(), truss, solar, radiator, fit(1, 0, "battery"), lifeSupport, fit(3, 0, "water-recycler"), lab, ...labRacks);
  /** The same station with the labs already shed last tick and the battery at `kwh`. */
  const labsShedWithCharge = (kwh: number): Station => ({
    ...sheddingWithBattery(),
    batteries: { "1:0": kwh },
    // Every module ran all its loads last tick except the lab, which ran only its own systems.
    powerLoadsRunning: { 1: 99, 2: 99, 3: 99, 4: 1 },
  });
  /** Start of eclipse with a full battery and nothing shed yet. */
  const eclipseOnFullBattery = (): Station => ({ ...sheddingWithBattery(), tick: 720, batteries: { "1:0": 5 } });

  it("lets shed equipment stay off while the battery charges, rather than flicker", () => {
    const station = advance(sheddingWithBattery(), 200);

    expect(labsRunning(station)).toBe(false);
    expect(powerOf(station).stored).toBeGreaterThan(0);
  });

  it("restarts shed equipment item by item: what sunlight covers at once, the rest on a full battery", () => {
    // 3.5 kW of spare sunlight restarts three 1 kW racks straight away; the fourth waits.
    const power = powerOf(labsShedWithCharge(4.9));

    expect(power.modules[4]?.running.slots).toEqual([true, true, true, false]);
    expect(power.modules[4]?.shed[4]).toEqual({ kind: "waiting-for-full-battery" });
  });

  it("restarts shed equipment once the batteries are full", () => {
    const start = labsShedWithCharge(4.9);
    const restarted = advanceUntil(start, labsRunning, () => false, 200);
    const before = advance(start, restarted.tick - 1);

    expect(restarted.tick).toBeGreaterThan(1);
    expect(labsRunning(before)).toBe(false);
    expect(powerOf(restarted).stored).toBeCloseTo(powerOf(restarted).capacity, 1);
  });

  it("sheds each tier at its battery floor in eclipse, so life support outlasts the labs", () => {
    const labsShed = advanceUntil(eclipseOnFullBattery(), (s) => !labsRunning(s), () => false, 480);
    const fraction = (s: Station) => powerOf(s).stored / powerOf(s).capacity;

    expect(orbitOf(labsShed).phase).toBe("eclipse");
    expect(fraction(labsShed)).toBeCloseTo(BATTERY_FLOORS[4], 2);
    expect(powerOf(labsShed).modules[4]?.shed[4]).toEqual({ kind: "battery-floor", floor: BATTERY_FLOORS[4] });
    // The half held back carries the module systems to sunrise without going dark.
    const sunrise = advanceUntil(labsShed, (s) => orbitOf(s).phase === "day", (s) => !powerOf(s).powered, 480);
    expect(powerOf(sunrise).stored).toBeGreaterThan(0);
  });

  it("restarts shed equipment straight away when sunlight alone can cover it", () => {
    const shed = run(createStation(), truss, solar, lifeSupport, fit(3, 0, "lab-rack"), fit(3, 1, "lab-rack"), fit(3, 2, "lab-rack"));
    // 0.5 kW systems + 3 kW of racks fits in 5.4 kW: nothing is shed.
    expect(powerOf(shed).supplied).toBe(true);

    const short = advance(run(shed, lab, ...labRacks), 5);
    expect(labsRunning(short)).toBe(false);

    // Take the life support module's racks out: 0.9 kW systems + 4 kW of lab racks fits.
    const enough = run(
      short,
      { type: "unfit", moduleId: 3, mount: { kind: "slot", index: 0 } },
      { type: "unfit", moduleId: 3, mount: { kind: "slot", index: 1 } },
      { type: "unfit", moduleId: 3, mount: { kind: "slot", index: 2 } },
    );
    expect(powerOf(enough).supplied).toBe(true);
  });

  describe("says why equipment is off", () => {
    it("not enough power, when there is no battery to draw on", () => {
      const station = run(createStation(), truss, solar, lifeSupport, lab, fit(3, 0, "lab-rack"), fit(3, 1, "lab-rack"), ...labRacks);

      expect(powerOf(station).modules[4]?.shed[4]).toEqual({ kind: "no-supply" });
      expect(powerOf(station).modules[4]?.shed[1]).toBeUndefined();
    });

    it("battery below the tier's floor, while it charges back up", () => {
      const station = advance(sheddingWithBattery(), 200);

      expect(powerOf(station).stored / powerOf(station).capacity).toBeLessThan(BATTERY_FLOORS[4]);
      expect(powerOf(station).modules[4]?.shed[4]).toEqual({ kind: "battery-floor", floor: BATTERY_FLOORS[4] });
    });

    it("waiting for a full battery, once above the floor but held off by the restart gap", () => {
      const station = labsShedWithCharge(3.5);

      expect(powerOf(station).stored / powerOf(station).capacity).toBeGreaterThan(BATTERY_FLOORS[4]);
      expect(powerOf(station).modules[4]?.shed[4]).toEqual({ kind: "waiting-for-full-battery" });
    });
  });
});
