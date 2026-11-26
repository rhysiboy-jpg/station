// Draws simulation state with PixiJS. Reads state only; never changes it.
import { Container, Graphics, Text } from "pixi.js";
import {
  connectionsOf,
  footprintOf,
  MODULE_TYPES,
  portsOf,
  type PlacedPort,
  type Placement,
  type Station,
} from "../sim";
import { palette } from "./palette";

/** Size of one grid cell in screen pixels. */
export const CELL = 48;

const PORT_LENGTH = 16;
const PORT_DEPTH = 5;
const MODULE_INSET = 6;
const MAJOR_EVERY = 4;

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

export interface StationHighlight {
  /** Module drawn as about to be removed. */
  removing?: number;
}

/** The station in grid space: (0, 0) is the corner of grid cell (0, 0). */
export function drawStation(station: Station, highlight: StationHighlight = {}): Container {
  const layer = new Container();
  const joined = new Set(
    connectionsOf(station).flatMap((c) => [portKey(c.a.port), portKey(c.b.port)]),
  );

  for (const module of station.modules) {
    const removing = highlight.removing === module.id;
    layer.addChild(drawModuleBody(module, removing ? palette.invalid : undefined));
    for (const port of portsOf(module)) {
      layer.addChild(drawPort(port, joined.has(portKey(port)) ? palette.portJoined : palette.portFree));
    }
    layer.addChild(drawLabel(module));
  }
  return layer;
}

/** A translucent preview of a module that is about to be placed. */
export function drawGhost(placement: Placement, valid: boolean): Container {
  const colour = valid ? palette.valid : palette.invalid;
  const layer = new Container();
  layer.alpha = 0.75;
  layer.addChild(drawModuleBody(placement, colour));
  for (const port of portsOf(placement)) layer.addChild(drawPort(port, colour));
  return layer;
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

function drawModuleBody(placement: Placement, tint?: number): Graphics {
  const { left, top, width, height } = bounds(placement);
  const type = MODULE_TYPES[placement.type];
  const g = new Graphics();

  if (type.pressurised) {
    g.roundRect(left, top, width, height, 6)
      .fill({ color: tint ?? palette.moduleFill, alpha: tint ? 0.25 : 1 })
      .stroke({ width: 2, color: tint ?? palette.moduleOutline });
  } else {
    // Unpressurised truss: an open lattice rather than a solid hull.
    g.rect(left, top, width, height).stroke({ width: 1.5, color: tint ?? palette.trussOutline });
    const step = 12;
    for (let d = step; d < width + height; d += step) {
      const x1 = left + Math.min(d, width);
      const y1 = top + Math.max(0, d - width);
      const x2 = left + Math.max(0, d - height);
      const y2 = top + Math.min(d, height);
      g.moveTo(x1, y1).lineTo(x2, y2);
    }
    g.stroke({ width: 1, color: tint ?? palette.trussOutline, alpha: 0.5 });
  }
  return g;
}

function drawLabel(placement: Placement): Text {
  const { left, top, width, height } = bounds(placement);
  const label = new Text({
    text: MODULE_TYPES[placement.type].short,
    style: { fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 10, fill: palette.label, letterSpacing: 1 },
  });
  label.anchor.set(0.5);
  label.position.set(left + width / 2, top + height / 2);
  if (height > width) label.rotation = -Math.PI / 2;
  label.alpha = 0.8;
  return label;
}

function drawPort(port: PlacedPort, colour: number): Graphics {
  const cx = port.x * CELL + CELL / 2;
  const cy = port.y * CELL + CELL / 2;
  const edge = CELL / 2 - MODULE_INSET;
  const g = new Graphics();

  switch (port.side) {
    case "north":
      g.rect(cx - PORT_LENGTH / 2, cy - edge - PORT_DEPTH, PORT_LENGTH, PORT_DEPTH);
      break;
    case "south":
      g.rect(cx - PORT_LENGTH / 2, cy + edge, PORT_LENGTH, PORT_DEPTH);
      break;
    case "west":
      g.rect(cx - edge - PORT_DEPTH, cy - PORT_LENGTH / 2, PORT_DEPTH, PORT_LENGTH);
      break;
    case "east":
      g.rect(cx + edge, cy - PORT_LENGTH / 2, PORT_DEPTH, PORT_LENGTH);
      break;
  }
  return g.fill({ color: colour });
}

function portKey(port: PlacedPort): string {
  return `${port.x},${port.y},${port.side}`;
}
