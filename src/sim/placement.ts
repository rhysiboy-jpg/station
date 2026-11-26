// Build rules: where a module may go, which modules are joined, and whether the
// station stays one connected structure.
import { footprintOf, portsAlign, portsOf, type PlacedPort, type Placement } from "./geometry";
import type { ModuleId, PlacedModule, Station } from "./station";

export type PlacementCheck =
  | { ok: true }
  | { ok: false; reason: "overlaps" | "not-connected"; message: string };

const cellKey = (x: number, y: number): string => `${x},${y}`;

/** Whether a module could be placed here, and if not, why. Never changes the station. */
export function checkPlacement(station: Station, placement: Placement): PlacementCheck {
  const occupied = new Set(
    station.modules.flatMap((m) => footprintOf(m).map((c) => cellKey(c.x, c.y))),
  );
  if (footprintOf(placement).some((c) => occupied.has(cellKey(c.x, c.y)))) {
    return { ok: false, reason: "overlaps", message: "It overlaps another module." };
  }

  const stationPorts = station.modules.flatMap(portsOf);
  const joins = portsOf(placement).some((port) => stationPorts.some((other) => portsAlign(port, other)));
  if (!joins) {
    return {
      ok: false,
      reason: "not-connected",
      message: "None of its ports line up with a free port on the station.",
    };
  }

  return { ok: true };
}

/** True when two placed modules are joined by a pair of aligned ports. */
export function areJoined(a: PlacedModule, b: PlacedModule): boolean {
  const bPorts = portsOf(b);
  return portsOf(a).some((port) => bPorts.some((other) => portsAlign(port, other)));
}

/** Modules reachable from the first module (the core node) through joined ports. */
export function connectedToCore(modules: PlacedModule[]): Set<ModuleId> {
  const [core] = modules;
  const reached = new Set<ModuleId>();
  if (!core) return reached;
  const queue = [core];
  reached.add(core.id);
  while (queue.length > 0) {
    const current = queue.shift() as PlacedModule;
    for (const other of modules) {
      if (!reached.has(other.id) && areJoined(current, other)) {
        reached.add(other.id);
        queue.push(other);
      }
    }
  }
  return reached;
}

export interface ConnectionEnd {
  moduleId: ModuleId;
  port: PlacedPort;
}

/** Two aligned ports joined together. */
export interface Connection {
  a: ConnectionEnd;
  b: ConnectionEnd;
}

/** Every Connection on the station, each listed once. */
export function connectionsOf(station: Station): Connection[] {
  const connections: Connection[] = [];
  station.modules.forEach((first, i) => {
    for (const second of station.modules.slice(i + 1)) {
      for (const port of portsOf(first)) {
        const match = portsOf(second).find((other) => portsAlign(port, other));
        if (match) {
          connections.push({ a: { moduleId: first.id, port }, b: { moduleId: second.id, port: match } });
        }
      }
    }
  });
  return connections;
}
