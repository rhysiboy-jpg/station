// Draws a Station read from the simulation core. Reads state only; never changes it.
import { Container, Graphics } from "pixi.js";
import { footprintOf, MODULE_TYPES, portsOf, type PlacedPort, type Station } from "../sim";
import { palette } from "./palette";

/** Size of one grid cell in screen pixels. */
export const CELL = 64;

const PORT_LENGTH = 20;
const PORT_DEPTH = 6;
const MODULE_INSET = 8;

export function drawGrid(width: number, height: number, originX: number, originY: number): Graphics {
  const g = new Graphics();
  const startX = (originX % CELL) - CELL;
  const startY = (originY % CELL) - CELL;
  const majorEvery = 4;

  for (let x = startX; x <= width + CELL; x += CELL) {
    const cell = Math.round((x - originX) / CELL);
    const major = cell % majorEvery === 0;
    g.moveTo(x, 0).lineTo(x, height).stroke({
      width: 1,
      color: major ? palette.gridMajor : palette.gridMinor,
    });
  }
  for (let y = startY; y <= height + CELL; y += CELL) {
    const cell = Math.round((y - originY) / CELL);
    const major = cell % majorEvery === 0;
    g.moveTo(0, y).lineTo(width, y).stroke({
      width: 1,
      color: major ? palette.gridMajor : palette.gridMinor,
    });
  }
  return g;
}

export function drawStation(station: Station): Container {
  const layer = new Container();

  for (const module of station.modules) {
    const cells = footprintOf(module);
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    const left = Math.min(...xs) * CELL + MODULE_INSET;
    const top = Math.min(...ys) * CELL + MODULE_INSET;
    const width = (Math.max(...xs) + 1) * CELL - MODULE_INSET - left;
    const height = (Math.max(...ys) + 1) * CELL - MODULE_INSET - top;

    const body = new Graphics()
      .roundRect(left, top, width, height, 6)
      .fill({ color: palette.moduleFill })
      .stroke({ width: 2, color: palette.moduleOutline });
    body.label = MODULE_TYPES[module.type].name;
    layer.addChild(body);

    for (const port of portsOf(module)) {
      layer.addChild(drawPort(port));
    }
  }

  return layer;
}

function drawPort(port: PlacedPort): Graphics {
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
  return g.fill({ color: palette.port });
}
