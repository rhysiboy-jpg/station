// Saves in the browser: autosave to local storage, and export/import as files.
// Storage can be missing or blocked (private windows, cleared site data), so
// every access is wrapped and the game carries on without it.
import { loadStation, orbitOf, saveStation, type LoadResult, type Station } from "../sim";

const AUTOSAVE_KEY = "orbitwright.autosave";
const BROKEN_KEY = "orbitwright.autosave.unreadable";

export type Restored = { station: Station; message: string } | { station: undefined; message: string };

/** The autosaved station, if there is one that loads. An unreadable one is set aside, not deleted. */
export function readAutosave(): Restored {
  let text: string | null = null;
  try {
    text = localStorage.getItem(AUTOSAVE_KEY);
  } catch {
    return { station: undefined, message: "" };
  }
  if (text === null) return { station: undefined, message: "" };
  const result = loadStation(text);
  if (result.ok) return { station: result.station, message: "Welcome back: your station was restored from autosave." };
  try {
    localStorage.setItem(BROKEN_KEY, text);
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // Nothing more we can do; start fresh.
  }
  return { station: undefined, message: `Your autosave couldn't be loaded (${result.message}) Starting a new station.` };
}

/** Returns false if storage is unavailable or full. */
export function writeAutosave(station: Station): boolean {
  try {
    localStorage.setItem(AUTOSAVE_KEY, saveStation(station));
    return true;
  } catch {
    return false;
  }
}

/** Downloads the station as a file. */
export function exportStation(station: Station): void {
  const blob = new Blob([saveStation(station)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `orbitwright-station-orbit-${orbitOf(station).orbit}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads a chosen file as a station. */
export async function importStation(file: File): Promise<LoadResult> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, message: "That file couldn't be read." };
  }
  return loadStation(text);
}

export interface SaveControlActions {
  current(): Station;
  /** Swap in an imported station. */
  replace(station: Station): void;
  say(text: string, bad?: boolean): void;
}

/**
 * Wires the Export and Import buttons, and autosaves every few seconds while
 * the station changes and whenever the tab is hidden or closed.
 */
export function bindSaveControls(actions: SaveControlActions): { saveNow(): void } {
  let autosaved: Station | undefined;
  const saveNow = () => {
    const station = actions.current();
    if (station === autosaved) return;
    const ok = writeAutosave(station);
    autosaved = station;
    const note = document.getElementById("save-state");
    if (note) note.textContent = ok ? "Autosaves in this browser." : "Can't autosave here (browser storage is off). Export to keep your station.";
  };

  document.getElementById("export-station")?.addEventListener("click", () => {
    exportStation(actions.current());
    actions.say("Station exported.");
  });
  const file = document.getElementById("import-file") as HTMLInputElement;
  document.getElementById("import-station")?.addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const chosen = file.files?.[0];
    file.value = "";
    if (!chosen) return;
    const result = await importStation(chosen);
    if (!result.ok) {
      actions.say(`Couldn't import ${chosen.name}: ${result.message}`, true);
      return;
    }
    actions.replace(result.station);
    actions.say(`Imported ${chosen.name}.`);
  });

  setInterval(saveNow, 5000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveNow();
  });
  window.addEventListener("pagehide", saveNow);
  return { saveNow };
}
