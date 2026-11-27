// Draws simulation state with PixiJS. Reads state only; never changes it.
import { Container, Graphics, Text } from "pixi.js";
import {
  connectionsOf,
  EQUIPMENT_TYPES,
  footprintOf,
  hardpointsOf,
  MODULE_TYPES,
  portsOf,
  type EquipmentTypeId,
  type PlacedModule,
  type PlacedPort,
  type Placement,
  type Station,
} from "../sim";
import type { ConnectionOverlay, Overlay } from "./overlays";
import { equipmentColour, palette } from "./palette";

/** Size of one grid cell in screen pixels. */
export const CELL = 48;

const PORT_LENGTH = 16;
const PORT_DEPTH = 5;
const MODULE_INSET = 6;
const MAJOR_EVERY = 4;
const FONT = "ui-monospace, Menlo, Consolas, monospace";

/** Grid lines across the screen, given where grid cell (0, 0)'s corner is on screen. */
export function drawGrid(width: number, height: number, originX: number, originY: number): Graphics {
  const g = new Graphics();
  const firstX = Math.floor(-originX / CELL);
  const firstY = Math.floor(-originY / CELL);

  for (let cx = firstX; cx * CELL + originX <= width; cx++) {
    const x = cx * CELL + originX + 0.5;
    g.moveTo(x, 0).lineTo(x, height).stroke({ width: 1, color: lineColour(cx) });
  }
  for (let cy = firstY; cy * CELL + originY <= height; cy++) {
    const y = cy * CELL + originY + 0.5;
    g.moveTo(0, y).lineTo(width, y).stroke({ width: 1, color: lineColour(cy) });
  }
  return g;
}

function lineColour(index: number): number {
  return ((index % MAJOR_EVERY) + MAJOR_EVERY) % MAJOR_EVERY === 0 ? palette.gridMajor : palette.gridMinor;
}

export interface StationDrawOptions {
  /** Module drawn as about to be removed. */
  removing?: number;
  selected?: number;
  /** Highlight free hardpoints (while an external equipment tool is chosen). */
  showFreeHardpoints?: boolean;
  /** A network overlay: a tint and figure per module; modules off the network are drawn dimmed. */
  overlay?: Overlay;
  /** Warning level and offline state per module, drawn as a ring whatever the overlay. */
  status?: Record<number, { level: "ok" | "yellow" | "red"; offline: boolean }>;
}

/** The station in grid space: (0, 0) is the corner of grid cell (0, 0). */
export function drawStation(station: Station, options: StationDrawOptions = {}): Container {
  const layer = new Container();
  const joined = new Set(connectionsOf(station).flatMap((c) => [portKey(c.a.port), portKey(c.b.port)]));

  for (const module of station.modules) {
    let tint: number | undefined;
    if (options.removing === module.id) tint = palette.invalid;
    else if (options.overlay) tint = options.overlay.modules[module.id]?.tint;

    const body = drawModuleBody(module, tint, options.overlay !== undefined && tint !== undefined && tint !== palette.invalid);
    const status = options.status?.[module.id];
    if ((options.overlay && !options.overlay.modules[module.id]) || status?.offline) body.alpha = 0.35;
    if (status && (status.offline || status.level !== "ok")) {
      layer.addChild(drawStatusRing(module, status.offline ? palette.offline : status.level === "red" ? palette.danger : palette.warning));
    }
    layer.addChild(body);
    if (options.selected === module.id) layer.addChild(drawStatusRing(module, palette.selected, 7));
    for (const port of portsOf(module)) {
      layer.addChild(drawPort(port, joined.has(portKey(port)) ? palette.portJoined : palette.portFree));
    }
    for (const hardpoint of hardpointsOf(station, module)) {
      if (hardpoint.equipment) layer.addChild(drawExternal(hardpoint, hardpoint.equipment));
      else if (hardpoint.blocked) layer.addChild(drawBlocked(hardpoint));
      else layer.addChild(drawEmptyHardpoint(hardpoint, options.showFreeHardpoints === true));
    }
    layer.addChild(drawSlots(module));
    layer.addChild(drawLabel(module, status?.offline ? { figure: "OFFLINE", figureColour: palette.danger } : options.overlay?.modules[module.id]));
  }
  for (const connection of options.overlay?.connections ?? []) layer.addChild(drawConnection(connection));
  return layer;
}

/** A ring just outside a module: yellow or red for warnings, grey when offline, white (further out) when selected. */
function drawStatusRing(placement: Placement, colour: number, pad = 3): Graphics {
  const { left, top, width, height } = bounds(placement);
  return new Graphics()
    .roundRect(left - pad, top - pad, width + pad * 2, height + pad * 2, 8)
    .stroke({ width: 2, color: colour, alpha: 0.9 });
}

/** A translucent preview of a module that is about to be placed. */
export function drawGhost(placement: Placement, valid: boolean): Container {
  const colour = valid ? palette.valid : palette.invalid;
  const layer = new Container();
  layer.alpha = 0.75;
  layer.addChild(drawModuleBody(placement, colour, false));
  for (const port of portsOf(placement)) layer.addChild(drawPort(port, colour));
  return layer;
}

/** A preview of external equipment about to go on a hardpoint. */
export function drawEquipmentGhost(hardpoint: PlacedPort, equipment: EquipmentTypeId): Container {
  const layer = new Container();
  layer.alpha = 0.6;
  layer.addChild(drawExternal(hardpoint, equipment));
  return layer;
}

/** An outline around a module, for previews of internal equipment. */
export function drawModuleOutline(placement: Placement, colour: number): Graphics {
  const { left, top, width, height } = bounds(placement);
  return new Graphics().roundRect(left - 3, top - 3, width + 6, height + 6, 8).stroke({ width: 2, color: colour });
}

function bounds(placement: Placement) {
  const cells = footprintOf(placement);
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const left = Math.min(...xs) * CELL + MODULE_INSET;
  const top = Math.min(...ys) * CELL + MODULE_INSET;
  return {
    left,
    top,
    width: (Math.max(...xs) + 1) * CELL - MODULE_INSET - left,
    height: (Math.max(...ys) + 1) * CELL - MODULE_INSET - top,
  };
}

function drawModuleBody(placement: Placement, tint: number | undefined, outlineOnly: boolean): Graphics {
  const { left, top, width, height } = bounds(placement);
  const type = MODULE_TYPES[placement.type];
  const g = new Graphics();
  const stroke = tint ?? palette.moduleOutline;

  if (type.pressurised) {
    const fill = outlineOnly || tint === undefined ? palette.moduleFill : tint;
    g.roundRect(left, top, width, height, 6)
      .fill({ color: fill, alpha: outlineOnly || tint === undefined ? 1 : 0.25 })
      .stroke({ width: 2, color: stroke });
  } else {
    // Unpressurised truss: an open lattice rather than a solid hull.
    const lattice = tint ?? palette.trussOutline;
    g.rect(left, top, width, height).stroke({ width: 1.5, color: lattice });
    const step = 12;
    for (let d = step; d < width + height; d += step) {
      const x1 = left + Math.min(d, width);
      const y1 = top + Math.max(0, d - width);
      const x2 = left + Math.max(0, d - height);
      const y2 = top + Math.min(d, height);
      g.moveTo(x1, y1).lineTo(x2, y2);
    }
    g.stroke({ width: 1, color: lattice, alpha: 0.5 });
  }
  return g;
}

function drawLabel(placement: Placement, overlay?: { figure?: string; figureColour?: number }): Container {
  const { left, top, width, height } = bounds(placement);
  const vertical = height > width;
  const group = new Container();
  group.position.set(left + width / 2, top + height / 2);
  if (vertical) group.rotation = -Math.PI / 2;

  const label = new Text({
    text: MODULE_TYPES[placement.type].short,
    style: { fontFamily: FONT, fontSize: 10, fill: palette.label, letterSpacing: 1 },
  });
  label.anchor.set(0.5);
  label.alpha = 0.8;
  group.addChild(label);

  if (overlay?.figure) {
    const figure = new Text({
      text: overlay.figure,
      style: { fontFamily: FONT, fontSize: 9, fill: overlay.figureColour ?? palette.label },
    });
    figure.anchor.set(0.5, 0);
    figure.position.set(0, 7);
    label.position.set(0, -4);
    group.addChild(figure);
  }
  return group;
}

/** Internal slots as a row of small pips along the module's top-left edge. */
function drawSlots(module: PlacedModule): Graphics {
  const { left, top } = bounds(module);
  const g = new Graphics();
  module.slots.forEach((equipment, i) => {
    const x = left + 5 + i * 9;
    const y = top + 5;
    if (equipment) g.rect(x, y, 6, 6).fill({ color: equipmentColour[equipment] });
    else g.rect(x + 0.5, y + 0.5, 5, 5).stroke({ width: 1, color: palette.hardpointFree });
  });
  return g;
}

/** Point on the module's outer edge for a port or hardpoint, plus outward and along directions. */
function edgeFrame(point: PlacedPort) {
  const cx = point.x * CELL + CELL / 2;
  const cy = point.y * CELL + CELL / 2;
  const edge = CELL / 2 - MODULE_INSET;
  const out = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[point.side] as [number, number];
  return {
    x: cx + out[0] * edge,
    y: cy + out[1] * edge,
    out,
    along: [-out[1], out[0]] as [number, number],
  };
}

/** A rectangle starting `from` px outward from the edge, `depth` deep and `span` wide. */
function outwardRect(point: PlacedPort, from: number, depth: number, span: number): number[] {
  const f = edgeFrame(point);
  const corner = (o: number, a: number) => [f.x + f.out[0] * o + f.along[0] * a, f.y + f.out[1] * o + f.along[1] * a];
  return [...corner(from, -span / 2), ...corner(from + depth, -span / 2), ...corner(from + depth, span / 2), ...corner(from, span / 2)];
}

/**
 * A connection as a bridge across the gap between two modules, filled by how much
 * of its capacity is in use: dim when quiet, yellow when nearly full, red
 * and wider when it is the bottleneck.
 */
function drawConnection(connection: ConnectionOverlay): Container {
  const gap = MODULE_INSET * 2;
  const colour = connection.bottleneck ? palette.danger : connection.load >= 0.75 ? palette.warning : palette.label;
  const span = connection.bottleneck ? 20 : 14;
  const g = new Graphics();
  g.poly(outwardRect(connection.port, 0, gap, span)).fill({ color: palette.background }).stroke({ width: 1, color: colour, alpha: 0.8 });
  // The filled share, from the middle outwards.
  const filled = span * Math.max(0.08, connection.load);
  g.poly(outwardRect(connection.port, 1, gap - 2, filled)).fill({ color: colour, alpha: connection.bottleneck ? 1 : 0.85 });
  if (!connection.label) return g;
  // Name what the bottleneck limits, just beside it along the edge.
  const layer = new Container();
  layer.addChild(g);
  const f = edgeFrame(connection.port);
  const tag = new Text({ text: connection.label, style: { fontFamily: FONT, fontSize: 11, fill: palette.danger, fontWeight: "bold" } });
  tag.anchor.set(0.5);
  tag.position.set(f.x + f.out[0] * MODULE_INSET + f.along[0] * 18, f.y + f.out[1] * MODULE_INSET + f.along[1] * 18);
  layer.addChild(tag);
  return layer;
}

function drawPort(port: PlacedPort, colour: number): Graphics {
  return new Graphics().poly(outwardRect(port, 0, PORT_DEPTH, PORT_LENGTH)).fill({ color: colour });
}

function drawEmptyHardpoint(hardpoint: PlacedPort, highlight: boolean): Graphics {
  const g = new Graphics().poly(outwardRect(hardpoint, 0, 3, 10));
  return highlight ? g.fill({ color: palette.valid }) : g.fill({ color: palette.hardpointFree });
}

function drawBlocked(hardpoint: PlacedPort): Graphics {
  const f = edgeFrame(hardpoint);
  const s = 3;
  const cx = f.x - f.out[0] * 5;
  const cy = f.y - f.out[1] * 5;
  return new Graphics()
    .moveTo(cx - s, cy - s)
    .lineTo(cx + s, cy + s)
    .moveTo(cx + s, cy - s)
    .lineTo(cx - s, cy + s)
    .stroke({ width: 1.5, color: palette.invalid });
}

function drawExternal(hardpoint: PlacedPort, equipment: EquipmentTypeId): Graphics {
  const g = new Graphics();
  const colour = equipmentColour[equipment];
  const f = edgeFrame(hardpoint);
  const mount = outwardRect(hardpoint, 0, 6, 4);
  g.poly(mount).fill({ color: palette.trussOutline });

  if (equipment === "solar-panel") {
    const panel = outwardRect(hardpoint, 6, CELL * 0.62, CELL * 0.8);
    g.poly(panel).fill({ color: colour }).stroke({ width: 1, color: 0x9cc3ff });
    for (const t of [0.25, 0.5, 0.75]) {
      const a = outwardRect(hardpoint, 6 + CELL * 0.62 * t, 0, CELL * 0.8);
      g.moveTo(a[0] as number, a[1] as number).lineTo(a[6] as number, a[7] as number);
    }
    g.stroke({ width: 1, color: 0x9cc3ff, alpha: 0.6 });
  } else if (equipment === "radiator") {
    g.poly(outwardRect(hardpoint, 6, CELL * 0.62, CELL * 0.5)).fill({ color: colour, alpha: 0.85 });
    for (const a of [-0.15, 0, 0.15]) {
      const fin = outwardRect(hardpoint, 8, CELL * 0.55, 0);
      const ox = f.along[0] * CELL * a;
      const oy = f.along[1] * CELL * a;
      g.moveTo((fin[0] as number) + ox, (fin[1] as number) + oy).lineTo((fin[2] as number) + ox, (fin[3] as number) + oy);
    }
    g.stroke({ width: 1, color: palette.background, alpha: 0.5 });
  } else {
    const tip = { x: f.x + f.out[0] * CELL * 0.45, y: f.y + f.out[1] * CELL * 0.45 };
    g.moveTo(f.x, f.y).lineTo(tip.x, tip.y).stroke({ width: 1.5, color: colour });
    g.circle(tip.x, tip.y, 7).stroke({ width: 1.5, color: colour });
  }
  g.label = EQUIPMENT_TYPES[equipment].name;
  return g;
}

function portKey(port: PlacedPort): string {
  return `${port.x},${port.y},${port.side}`;
}
