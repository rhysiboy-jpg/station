import { Application, Container, type FederatedPointerEvent } from "pixi.js";
import {
  applyCommand,
  checkPlacement,
  createStation,
  footprintOf,
  MODULE_TYPES,
  sizeOf,
  type Command,
  type GridCell,
  type ModuleTypeId,
  type Placement,
  type Rotation,
  type Station,
} from "./sim";
import { CELL, drawGhost, drawGrid, drawStation } from "./view/stationView";
import { palette } from "./view/palette";

type Tool = { kind: "place"; module: ModuleTypeId } | { kind: "remove" } | null;

const ROTATIONS: Rotation[] = [0, 90, 180, 270];
const PAN_STEP = CELL * 2;

let station: Station = createStation();
let tool: Tool = null;
let rotation: Rotation = 0;
let hover: GridCell | null = null;
/** Screen offset of grid cell (0, 0)'s corner from the centre of the view. */
const camera = { x: -CELL / 2, y: -CELL / 2 };

const message = document.getElementById("message") as HTMLElement;
const paletteEl = document.getElementById("palette") as HTMLElement;
const removeButton = document.getElementById("remove") as HTMLButtonElement;

function say(text: string, bad = false): void {
  message.textContent = text;
  message.classList.toggle("bad", bad);
}

function run(command: Command): boolean {
  const result = applyCommand(station, command);
  if (result.ok) {
    station = result.station;
    say("");
  } else {
    say(result.message, true);
  }
  return result.ok;
}

/** The placement under the cursor, centred on it. */
function hoveredPlacement(module: ModuleTypeId): Placement | null {
  if (!hover) return null;
  const { width, height } = sizeOf({ type: module, position: { x: 0, y: 0 }, rotation });
  return {
    type: module,
    rotation,
    position: { x: hover.x - Math.floor((width - 1) / 2), y: hover.y - Math.floor((height - 1) / 2) },
  };
}

function moduleAt(cell: GridCell) {
  return station.modules.find((m) => footprintOf(m).some((c) => c.x === cell.x && c.y === cell.y));
}

function setTool(next: Tool): void {
  tool = next;
  for (const button of paletteEl.querySelectorAll<HTMLButtonElement>("button")) {
    button.setAttribute("aria-pressed", String(tool?.kind === "place" && tool.module === button.dataset.module));
  }
  removeButton.setAttribute("aria-pressed", String(tool?.kind === "remove"));
  say(tool?.kind === "remove" ? "Click a module to remove it." : "");
}

function rotate(): void {
  rotation = ROTATIONS[(ROTATIONS.indexOf(rotation) + 1) % 4] as Rotation;
}

function buildPalette(): void {
  (Object.keys(MODULE_TYPES) as ModuleTypeId[]).forEach((id, index) => {
    const type = MODULE_TYPES[id];
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.module = id;
    button.innerHTML = `<span>${type.name}</span><small>${type.width}×${type.height} <kbd>${index + 1}</kbd></small>`;
    button.addEventListener("click", () => setTool(tool?.kind === "place" && tool.module === id ? null : { kind: "place", module: id }));
    paletteEl.appendChild(button);
  });
}

async function start(): Promise<void> {
  const host = document.getElementById("view");
  if (!host) throw new Error("#view element missing");

  const app = new Application();
  await app.init({
    resizeTo: host,
    background: palette.background,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  host.appendChild(app.canvas);
  app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  const scene = new Container();
  app.stage.addChild(scene);
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  const origin = () => ({
    x: Math.round(app.screen.width / 2 + camera.x),
    y: Math.round(app.screen.height / 2 + camera.y),
  });

  const render = (): void => {
    scene.removeChildren().forEach((child) => child.destroy({ children: true }));
    const { width, height } = app.screen;
    const o = origin();
    scene.addChild(drawGrid(width, height, o.x, o.y));

    const world = new Container();
    world.position.set(o.x, o.y);
    const hovered = hover ? moduleAt(hover) : undefined;
    world.addChild(drawStation(station, { removing: tool?.kind === "remove" ? hovered?.id : undefined }));

    if (tool?.kind === "place") {
      const placement = hoveredPlacement(tool.module);
      if (placement) {
        const check = checkPlacement(station, placement);
        world.addChild(drawGhost(placement, check.ok));
        if (!check.ok) say(check.message, true);
        else say(`${MODULE_TYPES[tool.module].name}: click to place, R to rotate.`);
      }
    }
    scene.addChild(world);
  };

  let panning: { x: number; y: number } | null = null;

  app.stage.on("pointermove", (e: FederatedPointerEvent) => {
    if (panning) {
      camera.x += e.global.x - panning.x;
      camera.y += e.global.y - panning.y;
      panning = { x: e.global.x, y: e.global.y };
    }
    const o = origin();
    hover = { x: Math.floor((e.global.x - o.x) / CELL), y: Math.floor((e.global.y - o.y) / CELL) };
    render();
  });
  app.stage.on("pointerleave", () => {
    hover = null;
    render();
  });
  app.stage.on("pointerdown", (e: FederatedPointerEvent) => {
    if (e.button === 2 || e.button === 1) {
      panning = { x: e.global.x, y: e.global.y };
      return;
    }
    if (e.button !== 0 || !hover) return;
    if (tool?.kind === "place") {
      const placement = hoveredPlacement(tool.module);
      if (placement) run({ type: "place", module: placement.type, position: placement.position, rotation });
    } else if (tool?.kind === "remove") {
      const target = moduleAt(hover);
      if (target) run({ type: "remove", moduleId: target.id });
    }
    render();
  });
  const stopPanning = () => {
    panning = null;
  };
  app.stage.on("pointerup", stopPanning);
  app.stage.on("pointerupoutside", stopPanning);

  document.getElementById("rotate")?.addEventListener("click", () => {
    rotate();
    render();
  });
  removeButton.addEventListener("click", () => {
    setTool(tool?.kind === "remove" ? null : { kind: "remove" });
    render();
  });
  document.getElementById("undo")?.addEventListener("click", () => {
    run({ type: "undo" });
    render();
  });

  window.addEventListener("keydown", (e) => {
    const ids = Object.keys(MODULE_TYPES) as ModuleTypeId[];
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === "z") {
      e.preventDefault();
      run({ type: "undo" });
    } else if (key === "r") rotate();
    else if (key === "x" || key === "delete") setTool(tool?.kind === "remove" ? null : { kind: "remove" });
    else if (key === "escape") setTool(null);
    else if (/^[1-9]$/.test(key) && ids[Number(key) - 1]) setTool({ kind: "place", module: ids[Number(key) - 1] as ModuleTypeId });
    else if (key === "arrowleft" || key === "a") camera.x += PAN_STEP;
    else if (key === "arrowright" || key === "d") camera.x -= PAN_STEP;
    else if (key === "arrowup" || key === "w") camera.y += PAN_STEP;
    else if (key === "arrowdown" || key === "s") camera.y -= PAN_STEP;
    else return;
    render();
  });

  render();
  app.renderer.on("resize", render);
}

buildPalette();
start().catch((error: unknown) => {
  console.error(error);
  say("Could not start the renderer.", true);
});
