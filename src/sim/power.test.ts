import { describe, expect, it } from "vitest";
import {
  advance,
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
