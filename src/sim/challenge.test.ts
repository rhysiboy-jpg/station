import { describe, expect, it } from "vitest";
import {
  advance,
  applyCommand,
  CHALLENGES,
  challengeOf,
  createStation,
  loadStation,
  OFFLINE_AFTER_TICKS,
  saveStation,
  TICKS_PER_ORBIT,
  type ChallengeId,
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
const start = (challenge: ChallengeId | null): Command => ({ type: "challenge", challenge });
const crew = (moduleId: number, headcount: number): Command => ({ type: "crew", moduleId, headcount });
const slot = (moduleId: number, index: number, equipment: EquipmentTypeId): Command => ({
  type: "fit",
  moduleId,
  mount: { kind: "slot", index },
  equipment,
});

/** Core node (1) and a habitat (2) with two crew: enough air and water for a few orbits. */
const twoCrew = () => run(createStation(), { type: "place", module: "habitat", position: { x: 0, y: 1 }, rotation: 0 }, crew(2, 2));

describe("challenges as data", () => {
  it("include at least three, between them testing power, heat, life support and data", () => {
    const kinds = new Set(CHALLENGES.flatMap((c) => [...c.holds.map((h) => h.kind), ...c.goals.map((g) => g.kind)]));

    expect(CHALLENGES.length).toBeGreaterThanOrEqual(3);
    for (const kind of ["crew", "racks", "coolerThan", "downlinked"]) expect(kinds).toContain(kind);
    for (const c of CHALLENGES) expect(c.orbits).toBeGreaterThan(0);
  });
});

describe("a challenge", () => {
  it("isn't running in free play", () => {
    expect(challengeOf(createStation())).toBeNull();
  });

  it("starts from the current station and shows its progress", () => {
    const station = advance(run(twoCrew(), start("shakedown")), TICKS_PER_ORBIT);
    const progress = challengeOf(station);

    expect(progress?.outcome).toBe("running");
    expect(progress?.orbitsDone).toBeCloseTo(1, 3);
    expect(progress?.holds[0]).toMatchObject({ met: true, value: 2 });
  });

  it("is won when its holds last the whole time", () => {
    const station = advance(run(twoCrew(), start("shakedown")), TICKS_PER_ORBIT * 3 + 1);

    expect(challengeOf(station)?.outcome).toBe("won");
  });

  it("tolerates a brief lapse", () => {
    const lapsing = advance(run(twoCrew(), start("shakedown"), crew(2, 0)), OFFLINE_AFTER_TICKS - 10);
    const back = advance(run(lapsing, crew(2, 2)), TICKS_PER_ORBIT * 3);

    expect(challengeOf(back)?.outcome).toBe("won");
  });

  it("fails when a hold lapses for more than a quarter orbit, and says which", () => {
    const station = advance(run(twoCrew(), start("shakedown"), crew(2, 0)), OFFLINE_AFTER_TICKS + 1);
    const progress = challengeOf(station);

    expect(progress?.outcome).toBe("failed");
    expect(progress?.failedBecause).toMatch(/crew/i);
  });

  it("fails if the station is abandoned", () => {
    const abandoned = { ...run(twoCrew(), start("shakedown")), abandoned: true, abandonedBecause: "water" as const };

    expect(challengeOf(advance(abandoned, 1))?.outcome).toBe("failed");
  });

  it("with a goal, is won as soon as the goal is met, counting only what happens after it starts", () => {
    // 500 GB were sent before the challenge began; they don't count.
    const station = run({ ...createStation(), downlinked: 500 }, start("science-return"));
    const later = advance(station, 1);

    expect(challengeOf(later)?.goals[0]?.value).toBe(0);
    expect(challengeOf(later)?.outcome).toBe("running");
    const sent = { ...later, downlinked: 500 + 30 };
    expect(challengeOf(advance(sent, 1))?.outcome).toBe("won");
  });

  it("with a goal, fails when time runs out first", () => {
    const orbits = CHALLENGES.find((c) => c.id === "science-return")?.orbits ?? 0;
    const station = advance(run(createStation(), start("science-return")), TICKS_PER_ORBIT * orbits + 1);

    expect(challengeOf(station)?.outcome).toBe("failed");
    expect(challengeOf(station)?.failedBecause).toMatch(/time/i);
  });

  it("stops counting once it's over", () => {
    const won = advance(run(twoCrew(), start("shakedown")), TICKS_PER_ORBIT * 3 + 1);
    const later = advance(run(won, crew(2, 0)), OFFLINE_AFTER_TICKS * 2);

    expect(challengeOf(later)?.outcome).toBe("won");
  });

  it("can be left for free play", () => {
    expect(challengeOf(run(twoCrew(), start("shakedown"), start(null)))).toBeNull();
  });

  it("is saved with the station", () => {
    const midway = advance(run(twoCrew(), start("shakedown")), 500);
    const loaded = loadStation(saveStation(midway));

    expect(loaded.ok && challengeOf(loaded.station)).toEqual(challengeOf(midway));
  });
});

describe("the conditions", () => {
  it("count lab racks that are actually working", () => {
    const lab = run(
      createStation(),
      { type: "place", module: "truss", position: { x: 1, y: 0 }, rotation: 90 },
      { type: "fit", moduleId: 2, mount: { kind: "hardpoint", index: 0 }, equipment: "solar-panel" },
      { type: "place", module: "habitat", position: { x: 0, y: 1 }, rotation: 0 },
      { type: "place", module: "lab", position: { x: -1, y: -2 }, rotation: 0 },
      slot(4, 0, "lab-rack"),
      slot(4, 1, "lab-rack"),
      slot(4, 2, "lab-rack"),
      crew(4, 1),
      start("night-shift"),
    );

    expect(challengeOf(lab)?.holds[0]).toMatchObject({ value: 2, met: false });
  });

  it("measure the hottest module against a temperature", () => {
    const hot = { ...run(createStation(), start("cool-running")), temperature: { 1: 30 } };

    expect(challengeOf(hot)?.holds.find((h) => h.kind === "coolerThan")).toMatchObject({ value: 30, met: false });
  });
});

describe("winnable", () => {
  it("night shift: 4 racks through eclipse need batteries sized above the 50% floor", () => {
    // Core node (1) with a battery; truss (2) east with two solar panels and a
    // radiator; lab (3) north with four racks, two crew and a radiator on its
    // east face; habitat (4) south for beds, with a second battery.
    const station = run(
      createStation(),
      slot(1, 0, "battery"),
      { type: "place", module: "truss", position: { x: 1, y: 0 }, rotation: 90 },
      { type: "fit", moduleId: 2, mount: { kind: "hardpoint", index: 0 }, equipment: "solar-panel" },
      { type: "fit", moduleId: 2, mount: { kind: "hardpoint", index: 1 }, equipment: "solar-panel" },
      { type: "fit", moduleId: 2, mount: { kind: "hardpoint", index: 3 }, equipment: "radiator" },
      { type: "place", module: "lab", position: { x: -1, y: -2 }, rotation: 0 },
      ...[0, 1, 2, 3].map((i) => slot(3, i, "lab-rack")),
      { type: "fit", moduleId: 3, mount: { kind: "hardpoint", index: 1 }, equipment: "radiator" },
      { type: "place", module: "habitat", position: { x: 0, y: 1 }, rotation: 0 },
      slot(4, 0, "battery"),
      crew(3, 2),
    );
    // Charge the batteries through the first day, then start.
    const ready = run(advance(station, 700), start("night-shift"));
    const done = advance(ready, TICKS_PER_ORBIT * 3 + 1);

    expect(challengeOf(done)?.failedBecause).toBeNull();
    expect(challengeOf(done)?.outcome).toBe("won");
  });
});
