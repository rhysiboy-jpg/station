// The challenge panel: pick a challenge (or free play), then follow its progress.
import { CHALLENGES, CHALLENGE_LAPSE_TICKS, challengeOf, TICKS_PER_SECOND_AT_1X, type ChallengeId, type Station } from "../sim";
import { patch } from "./patch";

export interface ChallengeActions {
  start(id: ChallengeId): void;
  quit(): void;
}

/** The challenge chosen in the picker but not yet started. */
let picked: ChallengeId = CHALLENGES[0].id;

const seconds = (ticks: number) => `${Math.ceil(ticks / TICKS_PER_SECOND_AT_1X)}s`;

export function renderChallenge(station: Station, actions: ChallengeActions): void {
  const panel = document.getElementById("challenge");
  if (!panel) return;
  const progress = challengeOf(station);
  const html: string[] = [];

  if (!progress) {
    const chosen = CHALLENGES.find((c) => c.id === picked) ?? CHALLENGES[0];
    html.push(`<p class="muted">Free play. Pick a goal to aim for:</p>`);
    html.push(
      `<label class="setting">Challenge<select data-pick>${CHALLENGES.map(
        (c) => `<option value="${c.id}"${c.id === picked ? " selected" : ""}>${c.name}</option>`,
      ).join("")}</select></label>`,
    );
    html.push(`<p>${chosen.brief}</p>`);
    html.push(`<p class="muted">It starts from your station as it is now, and building is locked until it ends (you can still move crew). A condition that must hold can slip for up to ${seconds(CHALLENGE_LAPSE_TICKS)} at 1× before it fails.</p>`);
    html.push(`<button type="button" data-start${station.abandoned ? " disabled" : ""}>Start challenge</button>`);
  } else {
    const { challenge, outcome } = progress;
    const done = Math.min(progress.orbitsDone, challenge.orbits);
    html.push(`<p><strong>${challenge.name}</strong> <span class="muted">· ${challenge.brief}</span></p>`);
    html.push(`<div class="progress" title="Orbits"><div class="fill" style="width:${(done / challenge.orbits) * 100}%"></div></div>`);
    html.push(`<p class="muted">Orbit ${done.toFixed(1)} of ${challenge.orbits}</p>`);
    html.push("<ul>");
    for (const h of progress.holds) {
      const value = h.kind === "coolerThan" ? `${h.value.toFixed(1)} °C` : `${h.value}`;
      const state = h.met ? `<span class="good">✓ ${value}</span>` : `<span class="bad">✗ ${value}${h.ticksToFail !== null ? ` · ${seconds(h.ticksToFail)}` : ""}</span>`;
      html.push(`<li><span>${h.label}</span>${state}</li>`);
    }
    for (const g of progress.goals) {
      html.push(`<li><span>${g.label}</span><span class="${g.met ? "good" : ""}">${g.value.toFixed(1)} / ${g.target} GB</span></li>`);
    }
    html.push("</ul>");
    if (outcome === "won") html.push(`<p class="good">Complete.</p>`);
    if (outcome === "failed") html.push(`<p class="bad">Failed: ${progress.failedBecause ?? ""}</p>`);
    html.push(`<button type="button" data-quit>${outcome === "running" ? "Give up (free play)" : "Back to free play"}</button>`);
  }

  const markup = html.join("");
  if (panel.dataset.markup === markup) return;
  panel.dataset.markup = markup;
  const next = document.createElement("template");
  next.innerHTML = markup;
  if (patch(panel, next.content)) return;
  panel.replaceChildren(next.content);
  panel.querySelector<HTMLSelectElement>("[data-pick]")?.addEventListener("change", (e) => {
    picked = (e.target as HTMLSelectElement).value as ChallengeId;
    panel.dataset.markup = "";
    renderChallenge(station, actions);
  });
  panel.querySelector("[data-start]")?.addEventListener("click", () => actions.start(picked));
  panel.querySelector("[data-quit]")?.addEventListener("click", () => actions.quit());
}
