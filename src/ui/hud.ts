// HTML panels: station status (time, orbit, power totals) and the module inspector.
import {
  EQUIPMENT_TYPES,
  hardpointsOf,
  MODULE_TYPES,
  orbitOf,
  powerOf,
  TICKS_PER_SECOND_AT_1X,
  type MountRef,
  type PlacedModule,
  type Station,
} from "../sim";

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
    balance.textContent = power.powered
      ? `${power.balance >= 0 ? "+" : "−"}${kw(Math.abs(power.balance))}`
      : "No power";
    balance.className = !power.powered ? "bad" : power.balance >= 0 ? "good" : "warn";
  }
  text("power-flow", `${kw(power.production)} / ${kw(power.demand)}`);
  text("power-stored", power.capacity > 0 ? `${power.stored.toFixed(2)} / ${power.capacity.toFixed(0)} kWh` : "none");
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
    html.push(`<dt>Status</dt><dd class="${power.powered ? "good" : "bad"}">${power.powered ? "Powered" : "No power: stopped"}</dd>`);
    html.push(`<dt>Uses</dt><dd>${kw(power.demand)}</dd>`);
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
          ? `<li><span>${EQUIPMENT_TYPES[equipment].name}</span><button type="button" data-unfit="slot:${index}">Remove</button></li>`
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
          `<li><span>${EQUIPMENT_TYPES[h.equipment].name} <small>${where}</small></span><button type="button" data-unfit="hardpoint:${h.index}">Remove</button></li>`,
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

function text(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el && el.textContent !== value) el.textContent = value;
}
