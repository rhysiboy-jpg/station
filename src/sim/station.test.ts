import { describe, expect, it } from "vitest";
import { createStation, footprintOf, portsOf } from "./index";

function coreNode() {
  const core = createStation().modules[0];
  if (!core) throw new Error("new station has no modules");
  return core;
}

describe("a new Station", () => {
  it("contains a single core node", () => {
    const station = createStation();

    expect(station.modules).toHaveLength(1);
    expect(station.modules[0]?.type).toBe("core-node");
  });

  it("is in low Earth orbit", () => {
    expect(createStation().orbit).toBe("LEO");
  });
});

describe("the core node", () => {
  it("occupies the single grid cell at the origin", () => {
    expect(footprintOf(coreNode())).toEqual([{ x: 0, y: 0 }]);
  });

  it("has a port on each of its four sides", () => {
    expect(portsOf(coreNode())).toEqual(
      expect.arrayContaining([
        { x: 0, y: 0, side: "north" },
        { x: 0, y: 0, side: "east" },
        { x: 0, y: 0, side: "south" },
        { x: 0, y: 0, side: "west" },
      ]),
    );
    expect(portsOf(coreNode())).toHaveLength(4);
  });
});
