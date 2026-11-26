import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createStation,
  EQUIPMENT_TYPES,
  MODULE_TYPES,
  hardpointsOf,
  type Command,
  type CommandResult,
  type ModuleTypeId,
  type Station,
} from "./index";

function accepted(result: CommandResult): Station {
  if (!result.ok) throw new Error(`expected accepted, got ${result.reason}: ${result.message}`);
  return result.station;
}

function run(station: Station, ...commands: Command[]): Station {
  return commands.reduce((s, c) => accepted(applyCommand(s, c)), station);
}

function moduleOf(station: Station, type: ModuleTypeId) {
  const found = station.modules.find((m) => m.type === type);
  if (!found) throw new Error(`no ${type}`);
  return found;
}

describe("equipment types", () => {
  it("include the eight prototype pieces, each internal or external", () => {
    const byMount = Object.fromEntries(
      Object.entries(EQUIPMENT_TYPES).map(([id, type]) => [id, type.mount]),
    );
    expect(byMount).toEqual({
      "solar-panel": "external",
      radiator: "external",
      antenna: "external",
      battery: "internal",
      "oxygen-generator": "internal",
      "water-recycler": "internal",
      "lab-rack": "internal",
      "data-storage": "internal",
    });
  });
});

/** Core node with a truss running east from it: truss cells (1,0) to (3,0). */
function withTruss(): Station {
  return run(createStation(), { type: "place", module: "truss", position: { x: 1, y: 0 }, rotation: 90 });
}

describe("fitting equipment", () => {
  it("puts internal equipment into a free slot", () => {
    const station = run(createStation(), {
      type: "fit",
      moduleId: 1,
      mount: { kind: "slot", index: 0 },
      equipment: "battery",
    });

    expect(moduleOf(station, "core-node").slots).toEqual(["battery"]);
  });

  it("puts external equipment onto a free hardpoint", () => {
    const base = withTruss();
    const truss = moduleOf(base, "truss");
    const station = run(base, {
      type: "fit",
      moduleId: truss.id,
      mount: { kind: "hardpoint", index: 0 },
      equipment: "solar-panel",
    });

    expect(hardpointsOf(station, moduleOf(station, "truss"))[0]?.equipment).toBe("solar-panel");
  });

  it("rejects internal equipment on a hardpoint and external equipment in a slot", () => {
    const base = withTruss();
    const truss = moduleOf(base, "truss");

    expect(
      applyCommand(base, { type: "fit", moduleId: truss.id, mount: { kind: "hardpoint", index: 0 }, equipment: "battery" }),
    ).toMatchObject({ ok: false, reason: "wrong-mount" });
    expect(
      applyCommand(base, { type: "fit", moduleId: 1, mount: { kind: "slot", index: 0 }, equipment: "radiator" }),
    ).toMatchObject({ ok: false, reason: "wrong-mount" });
  });

  it("rejects a mount that is already in use", () => {
    const fitBattery: Command = { type: "fit", moduleId: 1, mount: { kind: "slot", index: 0 }, equipment: "battery" };
    const station = run(createStation(), fitBattery);

    expect(applyCommand(station, fitBattery)).toMatchObject({ ok: false, reason: "occupied" });
  });

  it("rejects a mount the module doesn't have", () => {
    expect(
      applyCommand(createStation(), { type: "fit", moduleId: 1, mount: { kind: "slot", index: 5 }, equipment: "battery" }),
    ).toMatchObject({ ok: false, reason: "no-such-mount" });
  });

  it("can be undone", () => {
    const station = run(
      createStation(),
      { type: "fit", moduleId: 1, mount: { kind: "slot", index: 0 }, equipment: "battery" },
      { type: "undo" },
    );

    expect(moduleOf(station, "core-node").slots).toEqual([null]);
  });
});

describe("removing equipment", () => {
  it("empties the mount", () => {
    const station = run(
      createStation(),
      { type: "fit", moduleId: 1, mount: { kind: "slot", index: 0 }, equipment: "battery" },
      { type: "unfit", moduleId: 1, mount: { kind: "slot", index: 0 } },
    );

    expect(moduleOf(station, "core-node").slots).toEqual([null]);
  });

  it("is rejected when the mount is empty", () => {
    expect(
      applyCommand(createStation(), { type: "unfit", moduleId: 1, mount: { kind: "slot", index: 0 } }),
    ).toMatchObject({ ok: false, reason: "empty" });
  });
});

describe("a blocked hardpoint", () => {
  // The truss (turned 90 degrees, cells (1,0) to (3,0)) has hardpoint 0 on its east end
  // facing south onto (3,1). A lab at (2,1) joins the truss's middle port and covers (3,1).
  const lab: Command = { type: "place", module: "lab", position: { x: 2, y: 1 }, rotation: 0 };

  function fitSolar(station: Station): Command {
    return { type: "fit", moduleId: moduleOf(station, "truss").id, mount: { kind: "hardpoint", index: 0 }, equipment: "solar-panel" };
  }

  it("is reported when a module is attached on that face", () => {
    const station = run(withTruss(), lab);
    const hardpoints = hardpointsOf(station, moduleOf(station, "truss"));

    expect(hardpoints[0]).toMatchObject({ x: 3, y: 0, side: "south", blocked: true });
    expect(hardpoints.filter((h) => h.blocked)).toHaveLength(1);
  });

  it("accepts no equipment", () => {
    const station = run(withTruss(), lab);

    expect(applyCommand(station, fitSolar(station))).toMatchObject({ ok: false, reason: "blocked" });
  });

  it("loses its equipment when a module is placed over it, and says so", () => {
    const base = withTruss();
    const station = run(base, fitSolar(base));
    const result = applyCommand(station, lab);

    expect(result).toMatchObject({
      ok: true,
      displaced: [{ moduleId: moduleOf(base, "truss").id, equipment: "solar-panel" }],
    });
    const after = accepted(result);
    expect(hardpointsOf(after, moduleOf(after, "truss"))[0]?.equipment).toBeNull();
  });

  it("gets its equipment back when that placement is undone", () => {
    const base = withTruss();
    const station = run(base, fitSolar(base), lab, { type: "undo" });

    expect(hardpointsOf(station, moduleOf(station, "truss"))[0]?.equipment).toBe("solar-panel");
  });
});

describe("module data", () => {
  it("never puts a hardpoint on the same edge as a port", () => {
    const clashes = Object.entries(MODULE_TYPES).flatMap(([id, type]) =>
      type.hardpoints
        .filter((h) => type.ports.some((p) => p.x === h.x && p.y === h.y && p.side === h.side))
        .map((h) => `${id} ${h.x},${h.y} ${h.side}`),
    );
    expect(clashes).toEqual([]);
  });
});
