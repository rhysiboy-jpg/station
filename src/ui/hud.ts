// HTML panels: station status (time, orbit, totals) and the module inspector.
import { patch } from "./patch";
import {
  AIR_LIMITS,
  BATTERY_FLOORS,
  failureOf,
  dataOf,
  heatOf,
  lifeSupportOf,
  TEMPERATURE_LIMITS,
  EQUIPMENT_TYPES,
  LOWEST_PRIORITY,
  RACKS_PER_CREW,
  hardpointsOf,
  MODULE_TYPES,
  orbitOf,
  powerOf,
  TICKS_PER_SECOND_AT_1X,
  type EquipmentType,
  type EquipmentTypeId,
  type ModulePower,
  type Priority,
  type MountRef,
  type ShedReason,
  type Warning,
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
  text(
    "power-flow",
    `${power.production.toFixed(1)} / ${power.draw.toFixed(1)}${power.draw < power.demand ? ` of ${power.demand.toFixed(1)}` : ""} kW`,
  );
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

  const life = lifeSupportOf(station);
  status("crew-total", `${life.crew} / ${life.beds} beds`, life.beds === 0 ? "muted" : "");
  const airs = Object.values(life.modules).filter((a) => a.crew > 0 || a.co2 > 0 || a.o2 < 20.9);
  if (airs.length === 0) status("air-worst", "fresh", "good");
  else {
    const o2 = Math.min(...airs.map((a) => a.o2));
    const co2 = Math.max(...airs.map((a) => a.co2));
    const level = Math.max(levelOf(AIR_LIMITS.o2, o2, true), levelOf(AIR_LIMITS.co2, co2, false)) as 0 | 1 | 2;
    status("air-worst", `O₂ ${o2.toFixed(1)} · CO₂ ${co2.toFixed(2)}`, LEVEL_CLASS[level]);
  }
  const water = life.water;
  const waterLevel: 0 | 1 | 2 = water.capacity === 0 ? 0 : water.stored === 0 ? 2 : water.stored < water.capacity * 0.25 ? 1 : 0;
  status(
    "water-total",
    water.capacity > 0 ? `${water.stored.toFixed(1)} / ${water.capacity.toFixed(0)} kg` : "no tanks",
    water.capacity > 0 && life.crew > 0 ? LEVEL_CLASS[waterLevel] : "muted",
  );

  const heat = heatOf(station);
  const hottest = Math.max(...Object.values(heat.modules).map((h) => h.temperature));
  status("heat-worst", `${hottest.toFixed(1)} °C`, LEVEL_CLASS[levelOf(TEMPERATURE_LIMITS, hottest, false)]);
  const load = heat.networks.reduce((sum, n) => sum + n.load, 0);
  const capacity = heat.networks.reduce((sum, n) => sum + n.capacity, 0);
  status("heat-loop", `${load.toFixed(1)} / ${capacity.toFixed(1)} kW`, load > capacity ? "warn" : "good");

  const data = dataOf(station);
  status(
    "data-flow",
    `${data.produced.toFixed(1)} / ${Math.min(data.downlink, data.produced + data.stored).toFixed(1)} GB/h`,
    data.produced === 0 && data.downlink === 0 ? "muted" : data.produced > data.downlink ? "warn" : "good",
  );
  const filling = data.capacity > 0 && data.stored >= data.capacity * 0.95;
  status(
    "data-stored",
    data.capacity > 0 ? `${data.stored.toFixed(1)} / ${data.capacity} GB` : "no storage",
    filling ? "warn" : data.capacity === 0 ? "muted" : "",
  );
  status(
    "data-sent",
    `${data.downlinked.toFixed(1)} GB${data.lost > 0.05 ? ` · ${data.lost.toFixed(1)} lost` : ""}`,
    data.lost > 0.05 ? "warn" : "",
  );
  status("data-contact", data.contact ? "yes" : "no", data.contact ? "good" : "bad");
}

const seconds = (ticks: number) => `${Math.ceil(ticks / TICKS_PER_SECOND_AT_1X)}s`;

/** A warning in player terms. */
export function warningText(w: Warning): string {
  switch (w.condition) {
    case "temperature":
      return `Hot: ${w.value.toFixed(1)} °C`;
    case "o2":
      return `Low O₂: ${w.value.toFixed(1)} kPa`;
    case "co2":
      return `High CO₂: ${w.value.toFixed(2)} kPa`;
    case "water":
      return w.value <= 0 ? "No water" : `Water low: ${w.value.toFixed(1)} kg`;
    case "power":
      return w.level === "red" ? "No power" : "Shedding equipment";
  }
}

export interface AlertActions {
  select(moduleId: number): void;
}

/** The alerts list: every current warning and offline module, red first. */
export function renderAlerts(station: Station, actions: AlertActions): void {
  const panel = document.getElementById("alerts");
  if (!panel) return;
  const failure = failureOf(station);
  const name = (id: number) => {
    const module = station.modules.find((m) => m.id === id);
    return module ? MODULE_TYPES[module.type].name : "Module";
  };
  const rows: string[] = [];
  for (const [id, s] of Object.entries(failure.modules)) {
    if (s.offline) rows.push(`<li class="offline"><button type="button" data-module="${id}"><span>${name(Number(id))}</span><span>Offline</span></button></li>`);
  }
  for (const w of failure.warnings) {
    const countdown = w.level === "red" ? failure.modules[w.moduleId]?.ticksToOffline : null;
    const detail = `${warningText(w)}${countdown != null ? ` · ${seconds(countdown)}` : ""}`;
    rows.push(
      `<li class="${w.level}"><button type="button" data-module="${w.moduleId}"><span>${name(w.moduleId)}</span><span>${detail}</span></button></li>`,
    );
  }
  panel.hidden = rows.length === 0;
  const markup = rows.length === 0 ? "" : `<h2>Alerts (${rows.length})</h2><ul>${rows.join("")}</ul>`;
  if (panel.dataset.markup === markup) return;
  panel.dataset.markup = markup;
  const next = document.createElement("template");
  next.innerHTML = markup;
  if (patch(panel, next.content)) return;
  panel.replaceChildren(next.content);
  // One listener for the whole list, reading the row's module when clicked.
  if (!panel.dataset.wired) {
    panel.dataset.wired = "1";
    panel.addEventListener("click", (e) => {
      const button = (e.target as Element).closest<HTMLButtonElement>("[data-module]");
      if (button) actions.select(Number(button.dataset.module));
    });
  }
}

const LEVEL_CLASS: Record<0 | 1 | 2, string> = { 0: "good", 1: "warn", 2: "bad" };

/** 0 fine, 1 yellow, 2 red. `low` means falling below the limits is the danger. */
function levelOf(limits: { yellow: number; red: number }, value: number, low: boolean): 0 | 1 | 2 {
  if (low) return value < limits.red ? 2 : value < limits.yellow ? 1 : 0;
  return value >= limits.red ? 2 : value >= limits.yellow ? 1 : 0;
}

function status(id: string, value: string, className: string): void {
  text(id, value);
  const el = document.getElementById(id);
  if (el && el.className !== className) el.className = className;
}

export interface InspectorActions {
  unfit(moduleId: number, mount: MountRef): void;
  /** Add (positive) or remove (negative) crew, from the current headcount. */
  changeCrew(moduleId: number, delta: number): void;
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
  const failure = failureOf(station).modules[module.id];

  const html: string[] = [];
  html.push(`<h2>${type.name}</h2>`);
  html.push(`<p class="muted">${type.width}×${type.height} · ${type.pressurised ? "pressurised" : "unpressurised"}</p>`);
  if (failure && (failure.offline || failure.level !== "ok")) {
    html.push(`<h3>Status</h3><dl class="totals">`);
    if (failure.offline) {
      html.push(`<dt>State</dt><dd class="bad">Offline</dd>`);
      html.push(`<dt></dt><dd class="muted">Crew moved out. Recovers below ${TEMPERATURE_LIMITS.yellow} °C.</dd>`);
    } else if (failure.ticksToOffline !== null) {
      html.push(`<dt>State</dt><dd class="bad">Offline in ${seconds(failure.ticksToOffline)} at 1×</dd>`);
    }
    for (const w of failure.warnings) {
      html.push(`<dt>${w.level === "red" ? "Red" : "Yellow"}</dt><dd class="${w.level === "red" ? "bad" : "warn"}">${warningText(w)}</dd>`);
    }
    html.push(`</dl>`);
  }
  if (power) {
    html.push(`<h3 class="net power">Power</h3><dl class="totals">`);
    const status = power.offline
      ? `<dd class="bad">Offline</dd>`
      : !power.powered
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

  const life = lifeSupportOf(station);
  const air = life.modules[module.id];
  if (air) {
    const room = life.beds - life.crew;
    html.push(`<h3 class="net air">Crew and air</h3><dl class="totals">`);
    html.push(
      `<dt>Crew</dt><dd><span class="crew-control">` +
        `<button type="button" data-crew="-1" ${module.crew === 0 ? "disabled" : ""} aria-label="One fewer crew">−</button>` +
        `${module.crew}` +
        `<button type="button" data-crew="1" ${room <= 0 ? "disabled" : ""} aria-label="One more crew" title="${room <= 0 ? (life.beds === 0 ? "Build a habitat first" : "All beds taken") : `${room} bed${room === 1 ? "" : "s"} free`}">+</button>` +
        `</span></dd>`,
    );
    if (type.beds > 0) html.push(`<dt>Beds</dt><dd>${type.beds}</dd>`);
    html.push(`<dt>O₂</dt><dd class="${LEVEL_CLASS[levelOf(AIR_LIMITS.o2, air.o2, true)]}">${air.o2.toFixed(2)} kPa</dd>`);
    html.push(`<dt>CO₂</dt><dd class="${LEVEL_CLASS[levelOf(AIR_LIMITS.co2, air.co2, false)]}">${air.co2.toFixed(2)} kPa</dd>`);
    const network = life.water.networks.find((n) => n.moduleIds.includes(module.id));
    if (network) {
      html.push(
        `<dt>Water</dt><dd>${network.stored.toFixed(1)} / ${network.capacity.toFixed(0)} kg${type.waterTank > 0 ? ` <small>(${type.waterTank} kg tank here)</small>` : ""}</dd>`,
      );
    }
    html.push(`</dl>`);
  }

  const heatReport = heatOf(station);
  const heat = heatReport.modules[module.id];
  if (heat) {
    html.push(`<h3 class="net heat">Heat</h3><dl class="totals">`);
    html.push(
      `<dt>Temperature</dt><dd class="${LEVEL_CLASS[levelOf(TEMPERATURE_LIMITS, heat.temperature, false)]}">${heat.temperature.toFixed(1)} °C</dd>`,
    );
    html.push(`<dt>Makes</dt><dd>${kw(heat.made)}</dd>`);
    html.push(`<dt>Cooling takes</dt><dd>${kw(heat.removed)}</dd>`);
    if (Math.abs(heat.leaked) >= 0.05) {
      html.push(`<dt>${heat.leaked > 0 ? "Leaks out" : "Leaks in"}</dt><dd>${kw(Math.abs(heat.leaked))}</dd>`);
    }
    html.push(`</dl>`);
  }
  // Joints: what each connection to a neighbour carries, against its capacity.
  const powerJoints = powerOf(station).joints.filter((j) => j.a === module.id || j.b === module.id);
  if (powerJoints.length > 0) {
    html.push(`<h3>Joints</h3><dl class="totals">`);
    for (const pj of powerJoints) {
      const other = pj.a === module.id ? pj.b : pj.a;
      const otherModule = station.modules.find((m) => m.id === other);
      const hj = heatReport.joints.find((h) => (h.a === pj.a && h.b === pj.b) || (h.a === pj.b && h.b === pj.a));
      const part = (flow: number, capacity: number, bottleneck: boolean, unit: string) =>
        `<span class="${bottleneck ? "bad" : Math.abs(flow) >= capacity * 0.75 ? "warn" : ""}">${Math.abs(flow).toFixed(1)}/${capacity} ${unit}</span>`;
      html.push(
        `<dt>${otherModule ? MODULE_TYPES[otherModule.type].short : "?"}</dt><dd>` +
          `power ${part(pj.flow, pj.capacity, pj.bottleneck, "kW")}` +
          (hj ? ` · heat ${part(hj.flow, hj.capacity, hj.bottleneck, "kW")}` : "") +
          `</dd>`,
      );
    }
    html.push(`</dl>`);
  }


  const data = dataOf(station).modules[module.id];
  if (data && (data.produced > 0 || data.racksUntended > 0 || data.capacity > 0 || data.downlink > 0)) {
    html.push(`<h3 class="net data">Data</h3><dl class="totals">`);
    if (data.racksWorking + data.racksUntended > 0) {
      html.push(`<dt>Racks</dt><dd class="${data.racksUntended > 0 ? "warn" : ""}">${data.racksWorking} of ${data.racksWorking + data.racksUntended} tended</dd>`);
      if (data.racksUntended > 0) {
        html.push(`<dt></dt><dd class="muted">Each crew member tends ${RACKS_PER_CREW} racks.</dd>`);
      }
      html.push(`<dt>Makes</dt><dd>${data.produced.toFixed(1)} GB/h</dd>`);
    }
    if (data.capacity > 0) html.push(`<dt>Stores</dt><dd>${data.stored.toFixed(1)} / ${data.capacity} GB</dd>`);
    if (data.downlink > 0) html.push(`<dt>Sends</dt><dd>up to ${data.downlink.toFixed(1)} GB/h</dd>`);
    html.push(`</dl>`);
  }

  html.push(`<h3>Slots (${module.slots.length})</h3>`);
  if (module.slots.length === 0) html.push(`<p class="muted">No internal slots.</p>`);
  else {
    html.push("<ul>");
    // Racks are tended in slot order; running racks past the crew's reach idle.
    let tendable = (data?.racksWorking ?? 0);
    module.slots.forEach((equipment, index) => {
      let idle = "";
      if (equipment && (EQUIPMENT_TYPES[equipment] as EquipmentType).dataPerHour && power?.running.slots[index]) {
        if (tendable > 0) tendable--;
        else idle = `<br><small class="warn">Idle: needs crew to tend it</small>`;
      }
      html.push(
        equipment
          ? `<li><span>${EQUIPMENT_TYPES[equipment].name}${equipmentNote(equipment, power, power?.running.slots[index])}${idle}</span><button type="button" data-unfit="slot:${index}">Remove</button></li>`
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
  if (panel.dataset.markup === markup) return;
  panel.dataset.markup = markup;
  // While time runs the figures change every tick. Patch them in place when the
  // structure is unchanged, so buttons survive long enough to be clicked.
  const next = document.createElement("template");
  next.innerHTML = markup;
  if (panel.dataset.module === String(module.id) && patch(panel, next.content)) return;
  panel.dataset.module = String(module.id);
  panel.replaceChildren(next.content);
  panel.querySelector(".close")?.addEventListener("click", actions.close);
  for (const button of panel.querySelectorAll<HTMLButtonElement>("[data-crew]")) {
    // The station moves on after this panel is built, so the action reads the live headcount.
    button.addEventListener("click", () => actions.changeCrew(module.id, Number(button.dataset.crew)));
  }
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
    case "bottleneck":
      return "a joint on the way is full";
    default:
      return "no power";
  }
}

function text(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el && el.textContent !== value) el.textContent = value;
}
