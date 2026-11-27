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
  type JointFlow,
  type ModuleId,
  type PlacedPort,
  type Station,
} from "../sim";
import { palette } from "./palette";

export type OverlayKind = "power" | "heat" | "air" | "water" | "data";

export const OVERLAYS: { kind: OverlayKind; name: string; key: string }[] = [
  { kind: "power", name: "Power", key: "p" },
  { kind: "heat", name: "Heat", key: "h" },
  { kind: "air", name: "Air", key: "o" },
  { kind: "water", name: "Water", key: "u" },
  { kind: "data", name: "Data", key: "t" },
];

export interface ModuleOverlay {
  tint: number;
  figure?: string;
  figureColour?: number;
}

/** A joint drawn with how full it is. */
export interface JointOverlay {
  port: PlacedPort;
  /** Share of its capacity in use, 0 to 1. */
  load: number;
  bottleneck: boolean;
}

export interface Overlay {
  /** Per module; modules not on this overlay's network are absent and drawn dimmed. */
  modules: Record<ModuleId, ModuleOverlay>;
  /** Joints, for overlays whose resource moves through them with a capacity. */
  joints: JointOverlay[];
}

const jointsFrom = (joints: JointFlow[]): JointOverlay[] =>
  joints.map((j) => ({
    port: j.port,
    load: j.capacity > 0 ? Math.min(1, Math.abs(j.flow) / j.capacity) : 0,
    bottleneck: j.bottleneck,
  }));

type Level = "ok" | "yellow" | "red";
const levelTint = (level: Level, ok: number) => (level === "red" ? palette.danger : level === "yellow" ? palette.warning : ok);

export function overlayFor(kind: OverlayKind, station: Station): Overlay {
  const overlay: Record<ModuleId, ModuleOverlay> = {};
  let joints: JointOverlay[] = [];
  switch (kind) {
    case "power": {
      const power = powerOf(station);
      joints = jointsFrom(power.joints);
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
      joints = jointsFrom(heat.joints);
      for (const [id, h] of Object.entries(heat.modules)) {
        const level: Level =
          h.temperature >= TEMPERATURE_LIMITS.red ? "red" : h.temperature >= TEMPERATURE_LIMITS.yellow ? "yellow" : "ok";
        overlay[Number(id)] = {
          tint: levelTint(level, palette.heat),
          figure: `${h.temperature.toFixed(1)}°C`,
          figureColour: h.temperature > NOMINAL_TEMPERATURE + 0.5 ? levelTint(level, palette.heat) : palette.label,
        };
      }
      break;
    }
    case "air": {
      for (const [id, a] of Object.entries(lifeSupportOf(station).modules)) {
        const level: Level =
          a.o2 < AIR_LIMITS.o2.red || a.co2 > AIR_LIMITS.co2.red
            ? "red"
            : a.o2 < AIR_LIMITS.o2.yellow || a.co2 > AIR_LIMITS.co2.yellow
              ? "yellow"
              : "ok";
        // Show whichever gas is closer to its limit.
        const co2Closer = a.co2 / AIR_LIMITS.co2.yellow > (21 - a.o2) / (21 - AIR_LIMITS.o2.yellow);
        overlay[Number(id)] = {
          tint: levelTint(level, palette.air),
          figure: co2Closer ? `CO₂ ${a.co2.toFixed(2)}` : `O₂ ${a.o2.toFixed(1)}`,
          figureColour: levelTint(level, palette.label),
        };
      }
      break;
    }
    case "water": {
      for (const network of lifeSupportOf(station).water.networks) {
        const fraction = network.capacity > 0 ? network.stored / network.capacity : 0;
        const level: Level = fraction === 0 ? "red" : fraction < 0.25 ? "yellow" : "ok";
        // One figure per network, on the module with the biggest tank (room for the text).
        const tankOf = (id: ModuleId) => {
          const module = station.modules.find((m) => m.id === id);
          return module ? MODULE_TYPES[module.type].waterTank * 100 + MODULE_TYPES[module.type].volume : 0;
        };
        const label = network.moduleIds.reduce((best, id) => (tankOf(id) > tankOf(best) ? id : best));
        network.moduleIds.forEach((id) => {
          overlay[id] = {
            tint: levelTint(level, palette.water),
            figure: id === label ? `${network.stored.toFixed(1)} kg` : undefined,
            figureColour: levelTint(level, palette.label),
          };
        });
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
  return { modules: overlay, joints };
}
