// HTML panels: station status (time, orbit, power totals) and the module inspector.
import {
  BATTERY_FLOORS,
  EQUIPMENT_TYPES,
  LOWEST_PRIORITY,
  hardpointsOf,
  MODULE_TYPES,
  orbitOf,
  powerOf,
  TICKS_PER_SECOND_AT_1X,
  type EquipmentTypeId,
  type ModulePower,
  type Priority,
  type MountRef,
  type ShedReason,
  type PlacedModule,
  type Station,
} from "../sim";

const TIER_NAMES: Record<Priority, string> = {
  1: "Life-critical systems",
  2: "Water",
  3: "Cooling",
  4: "Science and comms",
};

const kw = (n: number) => `${n.toFixed(1)} kW`;
const sideName = { north: "N", east: "E", south: "S", west: "W" } as const;

export function renderStatus(station: Station): void {
  const orbit = orbitOf(station);
  const power = powerOf(station);

  text("orbit-label", `Orbit ${orbit.orbit}`);
  const phase = document.getElementById("phase-label");
  if (phase) {
    phase.textContent = orbit.phase === "day" ? "Day" : "Eclipse";
    phase.className = orbit.phase;
  }
  const marker = document.getElementById("orbit-marker");
  if (marker) marker.style.left = `${orbit.progress * 100}%`;
  const seconds = Math.ceil(orbit.ticksToNextPhase / TICKS_PER_SECOND_AT_1X);
  text("phase-countdown", `${orbit.phase === "day" ? "Eclipse" : "Sunrise"} in ${seconds}s at 1×`);

  const balance = document.getElementById("power-balance");
  if (balance) {
    const net = `${power.balance >= 0 ? "+" : "−"}${kw(Math.abs(power.balance))}`;
    balance.textContent = !power.powered ? "No power" : !power.supplied ? `Shedding · ${net}` : net;
    balance.className = !power.powered ? "bad" : !power.supplied || power.balance < 0 ? "warn" : "good";
  }
  text("power-flow", `${kw(power.production)} / ${kw(power.draw)}${power.draw < power.demand ? ` of ${kw(power.demand)}` : ""}`);
  const charge = power.capacity > 0 ? power.stored / power.capacity : 0;
  text(
    "power-stored",
    power.capacity > 0 ? `${power.stored.toFixed(2)} / ${power.capacity.toFixed(0)} kWh · ${Math.round(charge * 100)}%` : "none",
  );
  const bar = document.getElementById("battery-bar");
  if (bar) {
    bar.hidden = power.capacity === 0;
    if (!bar.querySelector(".floor")) {
      for (const [tier, floor] of Object.entries(BATTERY_FLOORS)) {
        if (floor === 0) continue;
        const mark = document.createElement("span");
        mark.className = "floor";
        mark.style.left = `${floor * 100}%`;
        mark.title = `${TIER_NAMES[Number(tier) as Priority]} (P${tier}) stop below ${Math.round(floor * 100)}%`;
        bar.append(mark);
      }
    }
    const fill = bar.querySelector<HTMLElement>(".fill");
    if (fill) fill.style.width = `${charge * 100}%`;
  }
}

export interface InspectorActions {
  unfit(moduleId: number, mount: MountRef): void;
  close(): void;
}

export function renderInspector(station: Station, module: PlacedModule | undefined, actions: InspectorActions): void {
  const panel = document.getElementById("inspector");
  if (!panel) return;
  if (!module) {
    panel.hidden = true;
    panel.replaceChildren();
    return;
  }
  panel.hidden = false;
  const type = MODULE_TYPES[module.type];
  const power = powerOf(station).modules[module.id];

  const html: string[] = [];
  html.push(`<h2>${type.name}</h2>`);
  html.push(`<p class="muted">${type.width}×${type.height} · ${type.pressurised ? "pressurised" : "unpressurised"}</p>`);
  if (power) {
    html.push(`<h3>Power</h3><dl class="totals">`);
    const status = !power.powered
      ? `<dd class="bad">Dark: ${shedText(power.shed[1])}</dd>`
      : power.draw < power.demand
        ? `<dd class="warn">Shedding P${power.runningUpTo + 1}+</dd>`
        : `<dd class="good">Powered</dd>`;
    html.push(`<dt>Status</dt>${status}`);
    html.push(`<dt>Uses</dt><dd>${kw(power.draw)}${power.draw < power.demand ? ` of ${kw(power.demand)}` : ""}</dd>`);
    html.push(`<dt>Makes</dt><dd>${kw(power.production)}</dd>`);
    if (power.capacity > 0) html.push(`<dt>Stores</dt><dd>${power.stored.toFixed(2)} / ${power.capacity} kWh</dd>`);
    html.push(`</dl>`);
  }

  html.push(`<h3>Slots (${module.slots.length})</h3>`);
  if (module.slots.length === 0) html.push(`<p class="muted">No internal slots.</p>`);
  else {
    html.push("<ul>");
    module.slots.forEach((equipment, index) => {
      html.push(
        equipment
          ? `<li><span>${EQUIPMENT_TYPES[equipment].name}${equipmentNote(equipment, power, power?.running.slots[index])}</span><button type="button" data-unfit="slot:${index}">Remove</button></li>`
          : `<li class="muted"><span>Empty</span></li>`,
      );
    });
    html.push("</ul>");
  }

  const hardpoints = hardpointsOf(station, module);
  html.push(`<h3>Hardpoints (${hardpoints.length})</h3>`);
  if (hardpoints.length === 0) html.push(`<p class="muted">No hardpoints.</p>`);
  else {
    html.push("<ul>");
    for (const h of hardpoints) {
      const where = `${sideName[h.side]} face`;
      if (h.equipment) {
        html.push(
          `<li><span>${EQUIPMENT_TYPES[h.equipment].name}${equipmentNote(h.equipment, power, power?.running.hardpoints[h.index])} <small>${where}</small></span><button type="button" data-unfit="hardpoint:${h.index}">Remove</button></li>`,
        );
      } else if (h.blocked) {
        html.push(`<li class="bad"><span>Blocked <small>${where}</small></span></li>`);
      } else {
        html.push(`<li class="muted"><span>Empty <small>${where}</small></span></li>`);
      }
    }
    html.push("</ul>");
  }
  html.push(`<button type="button" class="close" aria-label="Close inspector">✕</button>`);

  const markup = html.join("");
  if (panel.dataset.markup === markup) return; // Avoid rebuilding (and losing hover) every frame.
  panel.dataset.markup = markup;
  panel.innerHTML = markup;
  panel.querySelector(".close")?.addEventListener("click", actions.close);
  for (const button of panel.querySelectorAll<HTMLButtonElement>("[data-unfit]")) {
    const [kind, index] = (button.dataset.unfit ?? "").split(":");
    button.addEventListener("click", () =>
      actions.unfit(module.id, { kind: kind as "slot" | "hardpoint", index: Number(index) }),
    );
  }
}

/** Priority tier and, when shed, why it has stopped. Zero-draw equipment never needs power. */
function equipmentNote(equipment: EquipmentTypeId, power: ModulePower | undefined, running: boolean | undefined): string {
  const type = EQUIPMENT_TYPES[equipment];
  if (type.draw === 0) return "";
  const floor = BATTERY_FLOORS[type.priority];
  const tip = `Priority ${type.priority} of ${LOWEST_PRIORITY} (${LOWEST_PRIORITY} is shed first). Runs on batteries down to ${Math.round(floor * 100)}% charge.`;
  const stopped = running === false ? `<br><small class="bad">Off: ${shedText(power?.shed[type.priority])}</small>` : "";
  return ` <small title="${tip}">P${type.priority}</small>${stopped}`;
}

/** Why a tier is shed, in player terms. */
function shedText(reason: ShedReason | undefined): string {
  switch (reason?.kind) {
    case "no-supply":
      return "not enough power";
    case "battery-floor":
      return reason.floor > 0 ? `battery below ${Math.round(reason.floor * 100)}%` : "battery empty";
    case "waiting-for-full-battery":
      return "waiting for full battery";
    default:
      return "no power";
  }
}

function text(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el && el.textContent !== value) el.textContent = value;
}
