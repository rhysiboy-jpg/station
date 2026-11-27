// The two full-screen announcements: the station abandoned (the only game
// over) and a challenge won or failed. Each shows once and pauses the game.
import { challengeOf, orbitOf, type Station } from "../sim";

const ABANDONED_BECAUSE: Record<NonNullable<Station["abandonedBecause"]>, string> = {
  temperature: "the modules they could reach had overheated",
  o2: "the modules they could reach were short of oxygen",
  co2: "the air in the modules they could reach had too much CO₂",
  water: "the water had run out",
  room: "the modules fit to hold them had no room left",
};

export interface Banners {
  /** Show whichever banner the station now calls for, once. */
  update(station: Station): void;
  /** A station was swapped in: anything already over in it has had its moment. */
  reset(station: Station): void;
}

const resultKey = (station: Station) => {
  const run = station.challenge;
  return run && run.outcome !== "running" ? `${run.id}@${run.startTick}` : null;
};

export function createBanners(actions: { pause(): void; changed(): void }): Banners {
  const abandoned = document.getElementById("abandoned") as HTMLElement;
  const result = document.getElementById("challenge-result") as HTMLElement;
  let abandonedSeen = false;
  let resultShownFor: string | null = null;

  document.getElementById("abandoned-close")?.addEventListener("click", () => {
    abandonedSeen = true;
    actions.changed();
  });
  document.getElementById("challenge-result-close")?.addEventListener("click", () => {
    result.hidden = true;
  });

  return {
    update(station) {
      const showAbandoned = station.abandoned && !abandonedSeen;
      if (showAbandoned && abandoned.hidden) {
        actions.pause();
        const why = station.abandonedBecause ? ABANDONED_BECAUSE[station.abandonedBecause] : "nowhere fit was left";
        const text = document.getElementById("abandoned-text");
        if (text) {
          text.textContent = `On orbit ${orbitOf(station).orbit} the crew returned to Earth: ${why}. You can keep looking at what went wrong, or start again.`;
        }
      }
      abandoned.hidden = !showAbandoned;

      const key = resultKey(station);
      if (key && key !== resultShownFor && !station.abandoned) {
        resultShownFor = key;
        const progress = challengeOf(station);
        const won = station.challenge?.outcome === "won";
        result.classList.toggle("won", won);
        const title = document.getElementById("challenge-result-title");
        const text = document.getElementById("challenge-result-text");
        if (title) title.textContent = won ? "Challenge complete" : "Challenge failed";
        if (text) {
          text.textContent = won
            ? `${progress?.challenge.name}: done, on orbit ${orbitOf(station).orbit}. Pick another in the Challenge panel, or keep building.`
            : `${progress?.challenge.name}: ${progress?.failedBecause ?? ""} Fix the station and try again from the Challenge panel.`;
        }
        result.hidden = false;
        actions.pause();
      }
    },
    reset(station) {
      abandonedSeen = false;
      resultShownFor = resultKey(station);
    },
  };
}
