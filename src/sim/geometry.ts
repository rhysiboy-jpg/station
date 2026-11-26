// Grid geometry for placed modules: footprints and ports after rotation.
import { MODULE_TYPES, type ModuleTypeId, type Side } from "./content";

export interface GridCell {
  x: number;
  y: number;
}

/** Clockwise rotation in degrees. */
export type Rotation = 0 | 90 | 180 | 270;

export interface Placement {
  type: ModuleTypeId;
  /** Grid cell of the top-left corner of the module as placed (after rotation). */
  position: GridCell;
  rotation: Rotation;
}

export interface PlacedPort {
  /** Grid cell the port belongs to. */
  x: number;
  y: number;
  side: Side;
}

const SIDES: Side[] = ["north", "east", "south", "west"];

const OFFSET: Record<Side, GridCell> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};

function quarterTurns(rotation: Rotation): number {
  return rotation / 90;
}

/** Width and height in cells once rotated. */
export function sizeOf(placement: Placement): { width: number; height: number } {
  const { width, height } = MODULE_TYPES[placement.type];
  return quarterTurns(placement.rotation) % 2 === 0 ? { width, height } : { width: height, height: width };
}

/** The grid cells a placed module covers. */
export function footprintOf(placement: Placement): GridCell[] {
  const { width, height } = sizeOf(placement);
  const cells: GridCell[] = [];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      cells.push({ x: placement.position.x + dx, y: placement.position.y + dy });
    }
  }
  return cells;
}

/** A placed module's ports, in grid coordinates. */
export function portsOf(placement: Placement): PlacedPort[] {
  const type = MODULE_TYPES[placement.type];
  const turns = quarterTurns(placement.rotation);
  return type.ports.map((port) => {
    let x: number = port.x;
    let y: number = port.y;
    let w: number = type.width;
    let h: number = type.height;
    // Each clockwise quarter turn maps cell (x, y) of a w x h module to (h - 1 - y, x).
    for (let i = 0; i < turns; i++) {
      [x, y] = [h - 1 - y, x];
      [w, h] = [h, w];
    }
    const side = SIDES[(SIDES.indexOf(port.side) + turns) % 4] as Side;
    return { x: placement.position.x + x, y: placement.position.y + y, side };
  });
}

/** The cell a port faces: where a matching port would have to be. */
export function facingCell(port: PlacedPort): GridCell {
  const offset = OFFSET[port.side];
  return { x: port.x + offset.x, y: port.y + offset.y };
}

export function opposite(side: Side): Side {
  return SIDES[(SIDES.indexOf(side) + 2) % 4] as Side;
}

/** True when two ports sit on neighbouring cells and face each other. */
export function portsAlign(a: PlacedPort, b: PlacedPort): boolean {
  const facing = facingCell(a);
  return facing.x === b.x && facing.y === b.y && b.side === opposite(a.side);
}
