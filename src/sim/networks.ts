// Networks (ADR 0003): modules sharing one resource through their connections.
import { carries, MODULE_TYPES, type Resource } from "./content";
import { connectionsOf } from "./placement";
import { isOffline, offlineCutsNetworks, type ModuleId, type Station } from "./station";

export interface Network {
  resource: Resource;
  /** Members in station order. */
  moduleIds: ModuleId[];
}

/** The networks for one resource, recomputed from the current layout. */
export function networksOf(station: Station, resource: Resource): Network[] {
  // On hard difficulty an offline module drops out, cutting the network in two.
  const cut = offlineCutsNetworks(station);
  const members = station.modules.filter(
    (m) => carries(MODULE_TYPES[m.type], resource) && !(cut && isOffline(station, m.id)),
  );
  const memberIds = new Set(members.map((m) => m.id));
  const neighbours = new Map<ModuleId, ModuleId[]>(members.map((m) => [m.id, []]));
  for (const { a, b } of connectionsOf(station)) {
    if (memberIds.has(a.moduleId) && memberIds.has(b.moduleId)) {
      neighbours.get(a.moduleId)?.push(b.moduleId);
      neighbours.get(b.moduleId)?.push(a.moduleId);
    }
  }

  const seen = new Set<ModuleId>();
  const networks: Network[] = [];
  for (const start of members) {
    if (seen.has(start.id)) continue;
    const group = new Set<ModuleId>([start.id]);
    const queue = [start.id];
    seen.add(start.id);
    while (queue.length > 0) {
      for (const next of neighbours.get(queue.shift() as ModuleId) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          group.add(next);
          queue.push(next);
        }
      }
    }
    networks.push({ resource, moduleIds: members.filter((m) => group.has(m.id)).map((m) => m.id) });
  }
  return networks;
}
