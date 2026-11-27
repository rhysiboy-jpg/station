// A small max-flow solver for routing resources through connections (connection
// bottlenecks). Station graphs are tiny, so plain Edmonds-Karp is plenty; it
// is deterministic because every search visits arcs in the order they were added.

const EPSILON = 1e-9;

interface Arc {
  to: number;
  capacity: number;
  flow: number;
  /** Index of the paired arc in `to`'s list. */
  pair: number;
}

export class FlowGraph {
  private readonly arcs: Arc[][];

  constructor(nodes: number) {
    this.arcs = Array.from({ length: nodes }, () => []);
  }

  /** A one-way arc. Returns a handle for reading or changing it later. */
  addArc(from: number, to: number, capacity: number): ArcHandle {
    return this.add(from, to, capacity, 0);
  }

  /** A two-way pair of arcs that carries at most `capacity` in either direction (net). */
  addTwoWay(a: number, b: number, capacity: number): ArcHandle {
    return this.add(a, b, capacity, capacity);
  }

  private add(from: number, to: number, forward: number, backward: number): ArcHandle {
    const fromArcs = this.arcs[from] as Arc[];
    const toArcs = this.arcs[to] as Arc[];
    fromArcs.push({ to, capacity: forward, flow: 0, pair: toArcs.length });
    toArcs.push({ to: from, capacity: backward, flow: 0, pair: fromArcs.length - 1 });
    return { node: from, index: fromArcs.length - 1 };
  }

  /** Net flow along an arc or two-way pair, in its added direction (negative: the other way). */
  flow(handle: ArcHandle): number {
    return this.arc(handle).flow;
  }

  capacity(handle: ArcHandle): number {
    return this.arc(handle).capacity;
  }

  setCapacity(handle: ArcHandle, capacity: number): void {
    this.arc(handle).capacity = capacity;
  }

  /** True when no more can pass along the arc in its added direction. */
  saturated(handle: ArcHandle): boolean {
    const arc = this.arc(handle);
    return arc.capacity - arc.flow <= EPSILON;
  }

  private arc(handle: ArcHandle): Arc {
    return (this.arcs[handle.node] as Arc[])[handle.index] as Arc;
  }

  /** Pushes as much more as possible from `source` to `sink`, keeping existing flow. Returns the extra. */
  augment(source: number, sink: number): number {
    let total = 0;
    for (;;) {
      const via = this.shortestPath(source, sink);
      if (!via) return total;
      let push = Infinity;
      for (let node = sink; node !== source; ) {
        const [from, index] = via[node] as [number, number];
        const arc = (this.arcs[from] as Arc[])[index] as Arc;
        push = Math.min(push, arc.capacity - arc.flow);
        node = from;
      }
      for (let node = sink; node !== source; ) {
        const [from, index] = via[node] as [number, number];
        const arc = (this.arcs[from] as Arc[])[index] as Arc;
        arc.flow += push;
        ((this.arcs[arc.to] as Arc[])[arc.pair] as Arc).flow -= push;
        node = from;
      }
      total += push;
    }
  }

  /** Nodes reachable from `source` through arcs with room left: the source side of a minimum cut. */
  reachable(source: number): Set<number> {
    const seen = new Set([source]);
    const queue = [source];
    while (queue.length > 0) {
      const node = queue.shift() as number;
      for (const arc of this.arcs[node] as Arc[]) {
        if (!seen.has(arc.to) && arc.capacity - arc.flow > EPSILON) {
          seen.add(arc.to);
          queue.push(arc.to);
        }
      }
    }
    return seen;
  }

  /** Nodes that can still push flow on to `target` through arcs with room left. */
  reaching(target: number): Set<number> {
    const into = new Map<number, number[]>();
    this.arcs.forEach((list, node) => {
      for (const arc of list) {
        if (arc.capacity - arc.flow > EPSILON) into.set(arc.to, [...(into.get(arc.to) ?? []), node]);
      }
    });
    const seen = new Set([target]);
    const queue = [target];
    while (queue.length > 0) {
      for (const from of into.get(queue.shift() as number) ?? []) {
        if (!seen.has(from)) {
          seen.add(from);
          queue.push(from);
        }
      }
    }
    return seen;
  }

  /** A copy to try things on without disturbing this one. */
  clone(): FlowGraph {
    const copy = new FlowGraph(0);
    (copy as unknown as { arcs: Arc[][] }).arcs.push(...this.arcs.map((list) => list.map((arc) => ({ ...arc }))));
    return copy;
  }

  /** Restores every arc's flow and capacity from a copy taken earlier with `clone`. */
  restore(from: FlowGraph): void {
    const saved = (from as unknown as { arcs: Arc[][] }).arcs;
    this.arcs.forEach((list, node) => {
      list.forEach((arc, i) => {
        const old = (saved[node] as Arc[])[i];
        if (old) {
          arc.flow = old.flow;
          arc.capacity = old.capacity;
        } else {
          arc.flow = 0;
          arc.capacity = 0;
        }
      });
    });
  }

  private shortestPath(source: number, sink: number): ([number, number] | undefined)[] | undefined {
    const via: ([number, number] | undefined)[] = new Array(this.arcs.length);
    const seen = new Set([source]);
    const queue = [source];
    while (queue.length > 0) {
      const node = queue.shift() as number;
      (this.arcs[node] as Arc[]).forEach((arc, index) => {
        if (seen.has(arc.to) || arc.capacity - arc.flow <= EPSILON) return;
        seen.add(arc.to);
        via[arc.to] = [node, index];
        queue.push(arc.to);
      });
      if (seen.has(sink)) return via;
    }
    return undefined;
  }
}

export interface ArcHandle {
  node: number;
  index: number;
}

/** Something joining two nodes with a capacity, such as a connection between modules. */
export interface Limited<Id> {
  a: Id;
  b: Id;
  capacity: number;
}

/** Adds a two-way pair for each limit, mapping its ends to graph nodes. Returns the handles in order. */
export function addLimits<Id>(graph: FlowGraph, limits: Limited<Id>[], nodeOf: (id: Id) => number): ArcHandle[] {
  return limits.map((l) => graph.addTwoWay(nodeOf(l.a), nodeOf(l.b), l.capacity));
}

/**
 * Each limit's flow, and whether it lies on the cut between what the source
 * can still reach and what it can't: the limits holding flow back.
 */
export function limitFlows<Id, L extends Limited<Id>>(
  graph: FlowGraph,
  limits: L[],
  handles: ArcHandle[],
  nodeOf: (id: Id) => number,
  reach: Set<number> | undefined,
): (L & { flow: number; onCut: boolean })[] {
  return limits.map((l, i) => ({
    ...l,
    flow: graph.flow(handles[i] as ArcHandle),
    onCut: reach !== undefined && reach.has(nodeOf(l.a)) !== reach.has(nodeOf(l.b)),
  }));
}
