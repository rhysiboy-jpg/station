import { describe, expect, it } from "vitest";
import { advance, applyCommand, createStation, orbitOf, TICKS_PER_ORBIT, type Command, type Station } from "./index";

describe("a new station's clock", () => {
  it("starts at the beginning of the first orbit's day", () => {
    expect(orbitOf(createStation())).toMatchObject({ orbit: 1, phase: "day" });
  });
});

describe("the orbit", () => {
  it("lasts 1,200 ticks, about two minutes at 1x", () => {
    expect(TICKS_PER_ORBIT).toBe(1200);
  });

  it("is in day for the first 60% and eclipse for the last 40%", () => {
    expect(orbitOf(advance(createStation(), 719)).phase).toBe("day");
    expect(orbitOf(advance(createStation(), 720)).phase).toBe("eclipse");
    expect(orbitOf(advance(createStation(), 1199)).phase).toBe("eclipse");
  });

  it("starts the next orbit in day", () => {
    expect(orbitOf(advance(createStation(), 1200))).toMatchObject({ orbit: 2, phase: "day" });
  });

  it("counts down to the next change of phase", () => {
    expect(orbitOf(advance(createStation(), 700)).ticksToNextPhase).toBe(20);
  });
});

describe("determinism", () => {
  // Every system: power, crew and life support, heat, data, failure and a challenge.
  const commands: Command[] = [
    { type: "place", module: "truss", position: { x: 1, y: 0 }, rotation: 90 },
    { type: "fit", moduleId: 2, mount: { kind: "hardpoint", index: 0 }, equipment: "solar-panel" },
    { type: "fit", moduleId: 1, mount: { kind: "slot", index: 0 }, equipment: "battery" },
    { type: "place", module: "habitat", position: { x: 0, y: 1 }, rotation: 0 },
    { type: "fit", moduleId: 3, mount: { kind: "slot", index: 0 }, equipment: "data-storage" },
    { type: "place", module: "life-support", position: { x: 1, y: 4 }, rotation: 0 },
    { type: "fit", moduleId: 4, mount: { kind: "slot", index: 0 }, equipment: "oxygen-generator" },
    { type: "fit", moduleId: 4, mount: { kind: "slot", index: 1 }, equipment: "water-recycler" },
    { type: "place", module: "lab", position: { x: -1, y: -2 }, rotation: 0 },
    { type: "fit", moduleId: 5, mount: { kind: "slot", index: 0 }, equipment: "lab-rack" },
    { type: "fit", moduleId: 2, mount: { kind: "hardpoint", index: 3 }, equipment: "antenna" },
    { type: "crew", moduleId: 3, headcount: 2 },
    { type: "crew", moduleId: 5, headcount: 1 },
    { type: "challenge", challenge: "shakedown" },
  ];

  function play(stepsBetweenCommands: number[]): Station {
    let station = createStation();
    commands.forEach((command, i) => {
      const result = applyCommand(station, command);
      if (!result.ok) throw new Error(result.message);
      station = advance(result.station, stepsBetweenCommands[i] ?? 0);
    });
    return station;
  }

  it("gives identical state for the same commands at the same ticks", () => {
    expect(play([100, 400, 2000])).toEqual(play([100, 400, 2000]));
  });

  it("gives the same result however the ticks are batched, so speed never changes outcomes", () => {
    const station = play([0, 0, 0]);
    let oneByOne = station;
    for (let i = 0; i < 1500; i++) oneByOne = advance(oneByOne, 1);

    expect(advance(station, 1500)).toEqual(oneByOne);
    expect(advance(advance(station, 500), 1000)).toEqual(oneByOne);
  });
});
