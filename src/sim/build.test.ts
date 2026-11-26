import { describe, expect, it } from "vitest";
import { MODULE_TYPES } from "./index";

describe("module types", () => {
  it("include the six prototype modules", () => {
    expect(Object.keys(MODULE_TYPES).sort()).toEqual(
      ["core-node", "corridor", "habitat", "lab", "life-support", "truss"].sort(),
    );
  });

  it("mark only the truss as unpressurised", () => {
    const unpressurised = Object.entries(MODULE_TYPES)
      .filter(([, type]) => !type.pressurised)
      .map(([id]) => id);
    expect(unpressurised).toEqual(["truss"]);
  });
});

import { applyCommand, connectionsOf, createStation, footprintOf, portsOf, type ModuleTypeId, type Station } from "./index";

function expectAccepted(result: ReturnType<typeof applyCommand>): Station {
  if (!result.ok) throw new Error(`expected accepted, got ${result.reason}: ${result.message}`);
  return result.station;
}

describe("placing a module", () => {
  it("adds it when one of its ports lines up with a port on the station", () => {
    // A corridor turned 90 degrees runs east-west; its west port meets the core node's east port.
    const station = expectAccepted(
      applyCommand(createStation(), {
        type: "place",
        module: "corridor",
        position: { x: 1, y: 0 },
        rotation: 90,
      }),
    );

    expect(station.modules.map((m) => m.type)).toEqual(["core-node", "corridor"]);
  });
});

function place(
  station: Station,
  module: ModuleTypeId,
  x: number,
  y: number,
  rotation: 0 | 90 | 180 | 270 = 0,
) {
  return applyCommand(station, { type: "place", module, position: { x, y }, rotation });
}

describe("placing a module is rejected", () => {
  it("when it overlaps another module", () => {
    const result = place(createStation(), "corridor", 0, 0);

    expect(result).toMatchObject({ ok: false, reason: "overlaps" });
  });

  it("when it touches nothing", () => {
    const result = place(createStation(), "corridor", 5, 5);

    expect(result).toMatchObject({ ok: false, reason: "not-connected" });
  });

  it("when it touches the station but no ports line up", () => {
    // Unrotated, the corridor's ports are on its north and south ends, so its west
    // wall sits against the core node's east port with nothing to join.
    const result = place(createStation(), "corridor", 1, 0);

    expect(result).toMatchObject({ ok: false, reason: "not-connected" });
  });

  it("without changing the station", () => {
    const station = createStation();
    place(station, "corridor", 5, 5);

    expect(station.modules).toHaveLength(1);
  });
});

describe("rotating a module", () => {
  const habitat = (rotation: 0 | 90 | 180 | 270) =>
    ({ type: "habitat", position: { x: 0, y: 0 }, rotation }) as const;

  it("swaps its width and height at 90 degrees", () => {
    // A habitat is 2 wide and 3 tall; turned 90 degrees it is 3 wide and 2 tall.
    const cells = footprintOf(habitat(90));
    expect(Math.max(...cells.map((c) => c.x)) + 1).toBe(3);
    expect(Math.max(...cells.map((c) => c.y)) + 1).toBe(2);
  });

  it("turns its ports clockwise with it", () => {
    // Unrotated: north port on the top-left cell, south port on the bottom-right cell.
    expect(portsOf(habitat(0))).toEqual([
      { x: 0, y: 0, side: "north" },
      { x: 1, y: 2, side: "south" },
    ]);
    expect(portsOf(habitat(90))).toEqual([
      { x: 2, y: 0, side: "east" },
      { x: 0, y: 1, side: "west" },
    ]);
    expect(portsOf(habitat(180))).toEqual([
      { x: 1, y: 2, side: "south" },
      { x: 0, y: 0, side: "north" },
    ]);
    expect(portsOf(habitat(270))).toEqual([
      { x: 0, y: 1, side: "west" },
      { x: 2, y: 0, side: "east" },
    ]);
  });

  it("decides whether it can join", () => {
    // Below the core node, only a port facing north can join it.
    expect(place(createStation(), "habitat", 0, 1, 0)).toMatchObject({ ok: true });
    expect(place(createStation(), "habitat", 0, 1, 180)).toMatchObject({ ok: true });
    expect(place(createStation(), "habitat", 0, 1, 90)).toMatchObject({ ok: false, reason: "not-connected" });
  });
});

/** Core node with a corridor running east from it and a truss segment beyond that. */
function smallStation(): Station {
  const withCorridor = expectAccepted(place(createStation(), "corridor", 1, 0, 90));
  // The corridor ends at (3, 0) with an east port; a truss turned 90 degrees has a west port on its left end.
  return expectAccepted(place(withCorridor, "truss", 4, 0, 90));
}

function idOf(station: Station, type: ModuleTypeId): number {
  const found = station.modules.find((m) => m.type === type);
  if (!found) throw new Error(`no ${type}`);
  return found.id;
}

describe("removing a module", () => {
  it("takes it off the station", () => {
    const station = smallStation();
    const after = expectAccepted(applyCommand(station, { type: "remove", moduleId: idOf(station, "truss") }));

    expect(after.modules.map((m) => m.type)).toEqual(["core-node", "corridor"]);
  });

  it("is rejected when it would split the station", () => {
    const station = smallStation();
    const result = applyCommand(station, { type: "remove", moduleId: idOf(station, "corridor") });

    expect(result).toMatchObject({ ok: false, reason: "would-split" });
  });

  it("is rejected for the core node", () => {
    const result = applyCommand(createStation(), { type: "remove", moduleId: idOf(createStation(), "core-node") });

    expect(result).toMatchObject({ ok: false, reason: "core-node" });
  });

  it("is rejected for a module that isn't there", () => {
    const result = applyCommand(createStation(), { type: "remove", moduleId: 999 });

    expect(result).toMatchObject({ ok: false, reason: "no-such-module" });
  });
});

describe("undo", () => {
  it("takes back the last placement", () => {
    const station = smallStation();
    const after = expectAccepted(applyCommand(station, { type: "undo" }));

    expect(after.modules.map((m) => m.type)).toEqual(["core-node", "corridor"]);
  });

  it("puts back a removed module", () => {
    const station = smallStation();
    const removed = expectAccepted(applyCommand(station, { type: "remove", moduleId: idOf(station, "truss") }));
    const after = expectAccepted(applyCommand(removed, { type: "undo" }));

    expect(after.modules).toEqual(station.modules);
  });

  it("steps back through several build actions in turn", () => {
    const once = expectAccepted(applyCommand(smallStation(), { type: "undo" }));
    const twice = expectAccepted(applyCommand(once, { type: "undo" }));

    expect(twice.modules).toEqual(createStation().modules);
  });

  it("is rejected when there is nothing to undo", () => {
    expect(applyCommand(createStation(), { type: "undo" })).toMatchObject({
      ok: false,
      reason: "nothing-to-undo",
    });
  });

  it("does not count rejected commands", () => {
    const station = smallStation();
    const rejected = place(station, "lab", 20, 20);
    expect(rejected.ok).toBe(false);

    const after = expectAccepted(applyCommand(station, { type: "undo" }));
    expect(after.modules.map((m) => m.type)).toEqual(["core-node", "corridor"]);
  });
});

describe("connections", () => {
  it("list each pair of joined ports once", () => {
    const station = smallStation();
    const pairs = connectionsOf(station).map((c) => [c.a.moduleId, c.b.moduleId].sort());

    expect(pairs).toEqual([
      [idOf(station, "core-node"), idOf(station, "corridor")].sort(),
      [idOf(station, "corridor"), idOf(station, "truss")].sort(),
    ]);
  });
});
