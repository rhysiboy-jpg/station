import { Application, Container, type FederatedPointerEvent } from "pixi.js";
import {
  advance,
  applyCommand,
  checkPlacement,
  createStation,
  EQUIPMENT_TYPES,
  footprintOf,
  hardpointsOf,
  MODULE_TYPES,
  sizeOf,
  TICKS_PER_SECOND_AT_1X,
  type Command,
  type EquipmentTypeId,
  type GridCell,
  type HardpointState,
  type ModuleTypeId,
  type PlacedModule,
  type Placement,
  type Rotation,
  type Station,
} from "./sim";
import { renderInspector, renderStatus } from "./ui/hud";
import {
  CELL,
  drawEquipmentGhost,
  drawGhost,
  drawGrid,
  drawModuleOutline,
  drawStation,
} from "./view/stationView";
import { overlayFor, OVERLAYS, type OverlayKind } from "./view/overlays";
import { equipmentColour, palette } from "./view/palette";

type Tool =
  | { kind: "place"; module: ModuleTypeId }
  | { kind: "equip"; equipment: EquipmentTypeId }
  | { kind: "remove" }
  | null;

const ROTATIONS: Rotation[] = [0, 90, 180, 270];
const PAN_STEP = CELL * 2;
/** Never run more than this many ticks in one frame, so a stalled tab doesn't freeze on return. */
const MAX_TICKS_PER_FRAME = 50;

let station: Station = createStation();
let tool: Tool = null;
let rotation: Rotation = 0;
let hover: GridCell | null = null;
let selectedId: number | null = null;
let speed = 1;
let overlay: OverlayKind | null = null;
/** Screen offset of grid cell (0, 0)'s corner from the centre of the view. */
const camera = { x: -CELL / 2, y: -CELL / 2 };
let dirty = true;

const message = document.getElementById("message") as HTMLElement;
const modulesEl = document.getElementById("modules") as HTMLElement;
const equipmentEl = document.getElementById("equipment") as HTMLElement;
const removeButton = document.getElementById("remove") as HTMLButtonElement;
const overlaysEl = document.getElementById("overlays") as HTMLElement;

let stickyUntil = 0;

/** Shows the result of an action for a few seconds. */
function say(text: string, bad = false): void {
  message.textContent = text;
  message.classList.toggle("bad", bad);
  stickyUntil = text ? performance.now() + 3000 : 0;
}

/** Shows a hover hint, unless an action's result is still on screen. */
function hint(text: string, bad = false): void {
  if (performance.now() < stickyUntil) return;
  if (message.textContent !== text) message.textContent = text;
  message.classList.toggle("bad", bad);
}

function run(command: Command): boolean {
  const result = applyCommand(station, command);
  if (result.ok) {
    station = result.station;
    const lost = result.displaced.map(
      (d) => `${EQUIPMENT_TYPES[d.equipment].name.toLowerCase()} on the ${MODULE_TYPES[moduleById(d.moduleId)?.type ?? "core-node"].name.toLowerCase()}`,
    );
    say(lost.length > 0 ? `Removed the ${lost.join(", the ")}: its hardpoint is now blocked.` : "", lost.length > 0);
  } else {
    say(result.message, true);
  }
  dirty = true;
  return result.ok;
}

function moduleById(id: number | null): PlacedModule | undefined {
  return station.modules.find((m) => m.id === id);
}

function moduleAt(cell: GridCell): PlacedModule | undefined {
  return station.modules.find((m) => footprintOf(m).some((c) => c.x === cell.x && c.y === cell.y));
}

/** The module placement under the cursor, centred on it. */
function hoveredPlacement(module: ModuleTypeId): Placement | null {
  if (!hover) return null;
  const { width, height } = sizeOf({ type: module, position: { x: 0, y: 0 }, rotation });
  return {
    type: module,
    rotation,
    position: { x: hover.x - Math.floor((width - 1) / 2), y: hover.y - Math.floor((height - 1) / 2) },
  };
}

/** A free hardpoint facing the hovered cell, for external equipment. */
function hoveredHardpoint(): { module: PlacedModule; hardpoint: HardpointState } | null {
  if (!hover) return null;
  for (const module of station.modules) {
    for (const hardpoint of hardpointsOf(station, module)) {
      const facing = {
        north: { x: hardpoint.x, y: hardpoint.y - 1 },
        south: { x: hardpoint.x, y: hardpoint.y + 1 },
        east: { x: hardpoint.x + 1, y: hardpoint.y },
        west: { x: hardpoint.x - 1, y: hardpoint.y },
      }[hardpoint.side];
      if (facing.x === hover.x && facing.y === hover.y && !hardpoint.equipment && !hardpoint.blocked) {
        return { module, hardpoint };
      }
    }
  }
  return null;
}

function setTool(next: Tool): void {
  tool = next;
  for (const button of modulesEl.querySelectorAll<HTMLButtonElement>("button")) {
    button.setAttribute("aria-pressed", String(tool?.kind === "place" && tool.module === button.dataset.id));
  }
  for (const button of equipmentEl.querySelectorAll<HTMLButtonElement>("button")) {
    button.setAttribute("aria-pressed", String(tool?.kind === "equip" && tool.equipment === button.dataset.id));
  }
  removeButton.setAttribute("aria-pressed", String(tool?.kind === "remove"));
  say("");
  hint(
    tool?.kind === "remove"
      ? "Click a module to remove it."
      : tool?.kind === "equip"
        ? EQUIPMENT_TYPES[tool.equipment].mount === "external"
          ? "Point at the empty cell beside a free hardpoint (green marks)."
          : "Click a module with a free slot."
        : "",
  );
  dirty = true;
}

function setSpeed(next: number): void {
  speed = next;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-speed]")) {
    button.setAttribute("aria-pressed", String(Number(button.dataset.speed) === speed));
  }
}

/** Shows an overlay, or hides it if it is already showing. */
function toggleOverlay(kind: OverlayKind): void {
  overlay = overlay === kind ? null : kind;
  for (const button of overlaysEl.querySelectorAll<HTMLButtonElement>("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.overlay === overlay));
  }
  dirty = true;
}

function buildPalettes(): void {
  for (const { kind, name, key } of OVERLAYS) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.overlay = kind;
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `${name} <kbd>${key.toUpperCase()}</kbd>`;
    button.addEventListener("click", () => toggleOverlay(kind));
    overlaysEl.appendChild(button);
  }
  (Object.keys(MODULE_TYPES) as ModuleTypeId[]).forEach((id, index) => {
    const type = MODULE_TYPES[id];
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = id;
    button.innerHTML = `<span>${type.name}</span><small>${type.width}×${type.height} <kbd>${index + 1}</kbd></small>`;
    button.addEventListener("click", () =>
      setTool(tool?.kind === "place" && tool.module === id ? null : { kind: "place", module: id }),
    );
    modulesEl.appendChild(button);
  });
  (Object.keys(EQUIPMENT_TYPES) as EquipmentTypeId[]).forEach((id) => {
    const type = EQUIPMENT_TYPES[id];
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = id;
    button.title = `${type.name} (${type.mount})`;
    const colour = `#${equipmentColour[id].toString(16).padStart(6, "0")}`;
    const shortName = id === "oxygen-generator" ? "O2 / CO2" : type.name;
    button.innerHTML = `<span class="name"><span class="swatch" style="background:${colour}"></span>${shortName}</span>`;
    button.addEventListener("click", () =>
      setTool(tool?.kind === "equip" && tool.equipment === id ? null : { kind: "equip", equipment: id }),
    );
    equipmentEl.appendChild(button);
  });
}

function click(): void {
  if (!hover) return;
  if (tool?.kind === "place") {
    const placement = hoveredPlacement(tool.module);
    if (placement) run({ type: "place", module: placement.type, position: placement.position, rotation });
  } else if (tool?.kind === "remove") {
    const target = moduleAt(hover);
    if (target) {
      if (run({ type: "remove", moduleId: target.id }) && selectedId === target.id) selectedId = null;
    }
  } else if (tool?.kind === "equip") {
    const equipment = tool.equipment;
    if (EQUIPMENT_TYPES[equipment].mount === "external") {
      const target = hoveredHardpoint();
      if (target) {
        run({ type: "fit", moduleId: target.module.id, mount: { kind: "hardpoint", index: target.hardpoint.index }, equipment });
      } else say("Point at the empty cell beside a free hardpoint.", true);
    } else {
      const target = moduleAt(hover);
      if (!target) return;
      const slot = target.slots.indexOf(null);
      if (slot === -1) say(target.slots.length === 0 ? "This module has no slots." : "This module's slots are full.", true);
      else run({ type: "fit", moduleId: target.id, mount: { kind: "slot", index: slot }, equipment });
    }
  } else {
    selectedId = moduleAt(hover)?.id ?? null;
    dirty = true;
  }
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
    const external = tool?.kind === "equip" && EQUIPMENT_TYPES[tool.equipment].mount === "external";
    world.addChild(
      drawStation(station, {
        removing: tool?.kind === "remove" ? hovered?.id : undefined,
        selected: selectedId ?? undefined,
        showFreeHardpoints: external,
        overlay: overlay ? overlayFor(overlay, station) : undefined,
      }),
    );

    if (tool?.kind === "place") {
      const placement = hoveredPlacement(tool.module);
      if (placement) {
        const check = checkPlacement(station, placement);
        world.addChild(drawGhost(placement, check.ok));
        if (!check.ok) hint(check.message, true);
        else hint(`${MODULE_TYPES[tool.module].name}: click to place, R to rotate.`);
      }
    } else if (tool?.kind === "equip") {
      if (external) {
        const target = hoveredHardpoint();
        if (target) world.addChild(drawEquipmentGhost(target.hardpoint, tool.equipment));
      } else if (hovered) {
        world.addChild(drawModuleOutline(hovered, hovered.slots.includes(null) ? palette.valid : palette.invalid));
      }
    } else if (!tool) {
      hint("");
    }
    scene.addChild(world);

    renderStatus(station);
    renderInspector(station, moduleById(selectedId), {
      unfit: (moduleId, mount) => run({ type: "unfit", moduleId, mount }),
      changeCrew: (moduleId, delta) =>
        run({ type: "crew", moduleId, headcount: (moduleById(moduleId)?.crew ?? 0) + delta }),
      close: () => {
        selectedId = null;
        dirty = true;
      },
    });
    dirty = false;
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
    dirty = true;
  });
  app.stage.on("pointerleave", () => {
    hover = null;
    dirty = true;
  });
  app.stage.on("pointerdown", (e: FederatedPointerEvent) => {
    if (e.button === 2 || e.button === 1) {
      panning = { x: e.global.x, y: e.global.y };
      return;
    }
    if (e.button === 0) click();
  });
  const stopPanning = () => {
    panning = null;
  };
  app.stage.on("pointerup", stopPanning);
  app.stage.on("pointerupoutside", stopPanning);

  document.getElementById("rotate")?.addEventListener("click", () => {
    rotation = ROTATIONS[(ROTATIONS.indexOf(rotation) + 1) % 4] as Rotation;
    dirty = true;
  });
  removeButton.addEventListener("click", () => setTool(tool?.kind === "remove" ? null : { kind: "remove" }));
  document.getElementById("undo")?.addEventListener("click", () => run({ type: "undo" }));
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-speed]")) {
    button.addEventListener("click", () => setSpeed(Number(button.dataset.speed)));
  }

  let lastSpeed = 1;
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const ids = Object.keys(MODULE_TYPES) as ModuleTypeId[];
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === "z") {
      e.preventDefault();
      run({ type: "undo" });
    } else if (key === " ") {
      e.preventDefault();
      if (speed === 0) setSpeed(lastSpeed);
      else {
        lastSpeed = speed;
        setSpeed(0);
      }
    } else if (key === "r") rotation = ROTATIONS[(ROTATIONS.indexOf(rotation) + 1) % 4] as Rotation;
    else if (OVERLAYS.some((o) => o.key === key)) toggleOverlay(OVERLAYS.find((o) => o.key === key)?.kind as OverlayKind);
    else if (key === "x" || key === "delete") setTool(tool?.kind === "remove" ? null : { kind: "remove" });
    else if (key === "escape") {
      setTool(null);
      selectedId = null;
    } else if (/^[1-9]$/.test(key) && ids[Number(key) - 1]) setTool({ kind: "place", module: ids[Number(key) - 1] as ModuleTypeId });
    else if (key === "arrowleft" || key === "a") camera.x += PAN_STEP;
    else if (key === "arrowright" || key === "d") camera.x -= PAN_STEP;
    else if (key === "arrowup" || key === "w") camera.y += PAN_STEP;
    else if (key === "arrowdown" || key === "s") camera.y -= PAN_STEP;
    else return;
    dirty = true;
  });

  // Fixed-tick loop (ADR 0002): speed only changes how many ticks run per real second.
  let pending = 0;
  app.ticker.add((ticker) => {
    pending += (ticker.deltaMS / 1000) * TICKS_PER_SECOND_AT_1X * speed;
    const ticks = Math.min(Math.floor(pending), MAX_TICKS_PER_FRAME);
    pending = Math.min(pending - ticks, MAX_TICKS_PER_FRAME);
    if (ticks > 0) {
      station = advance(station, ticks);
      dirty = true;
    }
    if (dirty) render();
  });
  app.renderer.on("resize", () => {
    dirty = true;
  });
}

buildPalettes();
setSpeed(1);
start().catch((error: unknown) => {
  console.error(error);
  say("Could not start the renderer.", true);
});
