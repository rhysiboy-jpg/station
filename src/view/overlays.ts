// Network overlays: one per resource, each turning simulation readings into a
// tint and a short figure per module. Reads state only.
import {
  AIR_LIMITS,
  dataOf,
  heatOf,
  lifeSupportOf,
  MODULE_TYPES,
  NOMINAL_TEMPERATURE,
  powerOf,
  TEMPERATURE_LIMITS,
  levelAbove,
  levelBelow,
  worseLevel,
  WATER_LOW_FRACTION,
  type Level,
  type ConnectionFlow,
  type ModuleId,
  type PlacedPort,
  type Station,
} from "../sim";
import { levelColour, palette } from "./palette";

export type OverlayKind = "power" | "heat" | "air" | "water" | "data" | "bottlenecks";

export const OVERLAYS: { kind: OverlayKind; name: string; key: string }[] = [
  { kind: "power", name: "Power", key: "p" },
  { kind: "heat", name: "Heat", key: "h" },
  { kind: "air", name: "Air", key: "o" },
  { kind: "water", name: "Water", key: "u" },
  { kind: "data", name: "Data", key: "t" },
  { kind: "bottlenecks", name: "Limits", key: "b" },
];

export interface ModuleOverlay {
  tint: number;
  figure?: string;
  figureColour?: number;
}

/** A connection drawn with how full it is. */
export interface ConnectionOverlay {
  port: PlacedPort;
  /** Share of its capacity in use, 0 to 1. */
  load: number;
  bottleneck: boolean;
  /** Short tag drawn beside a bottleneck, naming what it limits (e.g. "P", "H"). */
  label?: string;
}

export interface Overlay {
  /** Per module; modules not on this overlay's network are absent and drawn dimmed. */
  modules: Record<ModuleId, ModuleOverlay>;
  /** Connections, for overlays whose resource moves through them with a capacity. */
  connections: ConnectionOverlay[];
}

const connectionsFrom = (connections: ConnectionFlow[]): ConnectionOverlay[] =>
  connections.map((j) => ({
    port: j.port,
    load: j.capacity > 0 ? Math.min(1, Math.abs(j.flow) / j.capacity) : 0,
    bottleneck: j.bottleneck,
  }));


export function overlayFor(kind: OverlayKind, station: Station): Overlay {
  const overlay: Record<ModuleId, ModuleOverlay> = {};
  let connections: ConnectionOverlay[] = [];
  switch (kind) {
    case "power": {
      const power = powerOf(station);
      connections = connectionsFrom(power.connections);
      for (const [id, p] of Object.entries(power.modules)) {
        const net = p.production - p.draw;
        overlay[Number(id)] = {
          tint: !p.powered ? palette.unpowered : p.draw < p.demand ? palette.shedding : palette.power,
          figure: `${net >= 0 ? "+" : "−"}${Math.abs(net).toFixed(1)} kW`,
          figureColour: net >= 0 ? palette.valid : palette.power,
        };
      }
      break;
    }
    case "heat": {
      const heat = heatOf(station);
      connections = connectionsFrom(heat.connections);
      for (const [id, h] of Object.entries(heat.modules)) {
        const level = levelAbove(h.temperature, TEMPERATURE_LIMITS);
        overlay[Number(id)] = {
          tint: levelColour(level, palette.heat),
          figure: `${h.temperature.toFixed(1)}°C`,
          figureColour: h.temperature > NOMINAL_TEMPERATURE + 0.5 ? levelColour(level, palette.heat) : palette.label,
        };
      }
      break;
    }
    case "air": {
      for (const [id, a] of Object.entries(lifeSupportOf(station).modules)) {
        const level = worseLevel(levelBelow(a.o2, AIR_LIMITS.o2), levelAbove(a.co2, AIR_LIMITS.co2));
        // Show whichever gas is closer to its limit.
        const co2Closer = a.co2 / AIR_LIMITS.co2.yellow > (21 - a.o2) / (21 - AIR_LIMITS.o2.yellow);
        overlay[Number(id)] = {
          tint: levelColour(level, palette.air),
          figure: co2Closer ? `CO₂ ${a.co2.toFixed(2)}` : `O₂ ${a.o2.toFixed(1)}`,
          figureColour: levelColour(level, palette.label),
        };
      }
      break;
    }
    case "water": {
      for (const network of lifeSupportOf(station).water.networks) {
        const fraction = network.capacity > 0 ? network.stored / network.capacity : 0;
        const level: Level = fraction === 0 ? "red" : fraction < WATER_LOW_FRACTION ? "yellow" : "ok";
        // One figure per network, on the module with the biggest tank (room for the text).
        const tankOf = (id: ModuleId) => {
          const module = station.modules.find((m) => m.id === id);
          return module ? MODULE_TYPES[module.type].waterTank * 100 + MODULE_TYPES[module.type].volume : 0;
        };
        const label = network.moduleIds.reduce((best, id) => (tankOf(id) > tankOf(best) ? id : best));
        network.moduleIds.forEach((id) => {
          overlay[id] = {
            tint: levelColour(level, palette.water),
            figure: id === label ? `${network.stored.toFixed(1)} kg` : undefined,
            figureColour: levelColour(level, palette.label),
          };
        });
      }
      break;
    }
    case "bottlenecks": {
      // Every connection at its busiest across power and heat, bottlenecks named.
      const power = powerOf(station);
      const heat = heatOf(station);
      const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
      const merged = new Map<string, ConnectionOverlay>();
      for (const [tag, flows] of [["P", power.connections], ["H", heat.connections]] as const) {
        for (const c of flows) {
          const k = `${key(c.a, c.b)}@${c.port.x},${c.port.y},${c.port.side}`;
          const load = c.capacity > 0 ? Math.min(1, Math.abs(c.flow) / c.capacity) : 0;
          const seen = merged.get(k);
          const label = [seen?.label, c.bottleneck ? tag : undefined].filter(Boolean).join("+") || undefined;
          merged.set(k, {
            port: c.port,
            load: Math.max(load, seen?.load ?? 0),
            bottleneck: c.bottleneck || (seen?.bottleneck ?? false),
            label,
          });
        }
      }
      connections = [...merged.values()];
      // Modules left short of power by a full connection.
      for (const m of station.modules) {
        const shed = Object.values(power.modules[m.id]?.shed ?? {});
        const short = shed.some((r) => r?.kind === "bottleneck");
        overlay[m.id] = {
          tint: short ? palette.warning : palette.label,
          figure: short ? "power short" : undefined,
          figureColour: palette.warning,
        };
      }
      break;
    }
    case "data": {
      // Every module carries data; show what each makes, holds or sends.
      for (const [id, d] of Object.entries(dataOf(station).modules)) {
        const parts: string[] = [];
        if (d.produced > 0) parts.push(`+${d.produced.toFixed(0)} GB/h`);
        if (d.capacity > 0) parts.push(`${d.stored.toFixed(0)}/${d.capacity} GB`);
        if (d.downlink > 0) parts.push(`↓${d.downlink.toFixed(0)} GB/h`);
        const full = d.capacity > 0 && d.stored >= d.capacity * 0.95;
        overlay[Number(id)] = {
          tint: d.racksUntended > 0 || full ? palette.warning : palette.data,
          figure: parts.length > 0 ? parts.join(" ") : undefined,
          figureColour: full ? palette.warning : palette.label,
        };
      }
      break;
    }
  }
  return { modules: overlay, connections };
}
