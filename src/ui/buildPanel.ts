// The build panel's buttons: one per module type, equipment type and overlay.
import { EQUIPMENT_TYPES, MODULE_TYPES, type EquipmentTypeId, type ModuleTypeId } from "../sim";
import { OVERLAYS, type OverlayKind } from "../view/overlays";
import { equipmentColour } from "../view/palette";

export interface BuildPanelActions {
  pickModule(id: ModuleTypeId): void;
  pickEquipment(id: EquipmentTypeId): void;
  toggleOverlay(kind: OverlayKind): void;
}

export function buildPanel(actions: BuildPanelActions): void {
  const modules = document.getElementById("modules") as HTMLElement;
  const equipment = document.getElementById("equipment") as HTMLElement;
  const overlays = document.getElementById("overlays") as HTMLElement;

  for (const { kind, name, key } of OVERLAYS) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.overlay = kind;
    button.className = `net ${kind}`;
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `${name} <kbd>${key.toUpperCase()}</kbd>`;
    button.addEventListener("click", () => actions.toggleOverlay(kind));
    overlays.appendChild(button);
  }
  (Object.keys(MODULE_TYPES) as ModuleTypeId[]).forEach((id, index) => {
    const type = MODULE_TYPES[id];
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = id;
    button.innerHTML = `<span>${type.name}</span><small>${type.width}×${type.height} <kbd>${index + 1}</kbd></small>`;
    button.addEventListener("click", () => actions.pickModule(id));
    modules.appendChild(button);
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
    button.addEventListener("click", () => actions.pickEquipment(id));
    equipment.appendChild(button);
  });
}
