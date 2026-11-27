import { describe, expect, it } from "vitest";
import {
  advance,
  applyCommand,
  createStation,
  loadStation,
  SAVE_VERSION,
  saveStation,
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

/** A station exercising every system, part-way through its third orbit. Built once: stations never mutate. */
let busy: Station | undefined;
function busyStation(): Station {
  busy ??= buildBusyStation();
  return busy;
}

function buildBusyStation(): Station {
  const built = run(
    createStation(),
    { type: "place", module: "truss", position: { x: 1, y: 0 }, rotation: 90 },
    { type: "fit", moduleId: 2, mount: { kind: "hardpoint", index: 0 }, equipment: "solar-panel" },
    { type: "fit", moduleId: 2, mount: { kind: "hardpoint", index: 3 }, equipment: "antenna" },
    slot(1, 0, "battery"),
    { type: "place", module: "habitat", position: { x: 0, y: 1 }, rotation: 0 },
    slot(3, 0, "data-storage"),
    { type: "place", module: "life-support", position: { x: 1, y: 4 }, rotation: 0 },
    slot(4, 0, "oxygen-generator"),
    slot(4, 1, "water-recycler"),
    { type: "place", module: "lab", position: { x: -1, y: -2 }, rotation: 0 },
    slot(5, 0, "lab-rack"),
    slot(5, 1, "lab-rack"),
    { type: "crew", moduleId: 3, headcount: 2 },
    { type: "crew", moduleId: 5, headcount: 1 },
    { type: "difficulty", difficulty: "hard" },
  );
  return advance(built, 2700);
}

const load = (text: string) => {
  const result = loadStation(text);
  if (!result.ok) throw new Error(`load failed: ${result.message}`);
  return result.station;
};

describe("saving and loading", () => {
  it("round-trips every part of a station's state, except undo history", () => {
    const station = busyStation();
    const loaded = load(saveStation(station));

    expect(loaded).toEqual({ ...station, history: [] });
  });

  it("saves every field a station has, so new systems can't be left out", () => {
    const saved = JSON.parse(saveStation(createStation())) as { station: Record<string, unknown> };
    const fields = Object.keys(createStation()).filter((key) => key !== "history");

    expect(Object.keys(saved.station).sort()).toEqual(fields.sort());
  });

  it("plays on exactly as the original would", () => {
    const station = busyStation();

    expect(advance(load(saveStation(station)), 500)).toEqual({ ...advance(station, 500), history: [] });
  });

  it("is versioned JSON a person can read", () => {
    const saved = JSON.parse(saveStation(createStation())) as { game: string; version: number };

    expect(saved.game).toBe("orbitwright");
    expect(saved.version).toBe(SAVE_VERSION);
  });
});

describe("older saves", () => {
  it("load version 1 files, from before challenges, in free play", () => {
    const v2 = JSON.parse(saveStation(busyStation())) as { version: number; station: Record<string, unknown> };
    delete v2.station.challenge;
    const result = loadStation(JSON.stringify({ ...v2, version: 1 }));

    expect(result.ok && result.station.challenge).toBeNull();
    expect(result.ok && result.station.tick).toBe(busyStation().tick);
  });
});

describe("loading a bad file", () => {
  const good = () => JSON.parse(saveStation(busyStation())) as { game: string; version: number; station: Record<string, unknown> };
  const rejects = (file: unknown, message: RegExp) => {
    const result = loadStation(typeof file === "string" ? file : JSON.stringify(file));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(message);
  };

  it("rejects something that isn't JSON", () => rejects("not a save {", /isn't a station file/i));

  it("rejects another game's file", () => rejects({ ...good(), game: "something-else" }, /isn't a station file/i));

  it("rejects a file from a newer version", () => rejects({ ...good(), version: SAVE_VERSION + 1 }, /newer version/i));

  it("rejects missing or broken fields", () => {
    const file = good();
    delete file.station.temperature;
    rejects(file, /temperature/);
    rejects({ ...good(), station: { ...good().station, tick: -5 } }, /tick/);
    rejects({ ...good(), station: { ...good().station, downlinked: "lots" } }, /downlinked/);
  });

  it("rejects unknown module and equipment types", () => {
    const file = good();
    (file.station.modules as { type: string }[])[1] = { ...(file.station.modules as object[])[1], type: "warp-core" } as never;
    rejects(file, /module type/i);
    const file2 = good();
    ((file2.station.modules as { slots: unknown[] }[])[0] as { slots: unknown[] }).slots = ["flux-capacitor"];
    rejects(file2, /equipment/i);
  });

  it("rejects equipment in the wrong kind of mount", () => {
    const file = good();
    ((file.station.modules as { slots: unknown[] }[])[0] as { slots: unknown[] }).slots = ["solar-panel"];
    rejects(file, /goes on a hardpoint/i);
  });

  it("rejects a layout the game wouldn't allow", () => {
    const overlapping = good();
    const modules = overlapping.station.modules as { position: { x: number; y: number } }[];
    (modules[2] as { position: { x: number; y: number } }).position = { x: 0, y: 0 };
    rejects(overlapping, /overlap|connected/i);

    const floating = good();
    ((floating.station.modules as { position: { x: number; y: number } }[])[4] as { position: object }).position = { x: 40, y: 40 };
    rejects(floating, /connected/i);
  });

  it("rejects more crew than beds", () => {
    const file = good();
    ((file.station.modules as { crew: number }[])[4] as { crew: number }).crew = 9;
    rejects(file, /beds/i);
  });
});
