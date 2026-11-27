// Keyboard shortcuts, as one table from key to action.
import { MODULE_TYPES, type ModuleTypeId } from "../sim";
import { OVERLAYS, type OverlayKind } from "../view/overlays";

export interface KeyboardActions {
  undo(): void;
  togglePause(): void;
  rotate(): void;
  toggleOverlay(kind: OverlayKind): void;
  toggleRemove(): void;
  cancel(): void;
  pickModule(id: ModuleTypeId): void;
  /** Pan by whole steps: x right, y down. */
  pan(dx: number, dy: number): void;
  /** Something changed that needs a redraw. */
  changed(): void;
}

export function bindKeyboard(actions: KeyboardActions): void {
  const modules = Object.keys(MODULE_TYPES) as ModuleTypeId[];
  const keys: Record<string, () => void> = {
    " ": actions.togglePause,
    r: actions.rotate,
    x: actions.toggleRemove,
    delete: actions.toggleRemove,
    escape: actions.cancel,
    arrowleft: () => actions.pan(-1, 0),
    a: () => actions.pan(-1, 0),
    arrowright: () => actions.pan(1, 0),
    d: () => actions.pan(1, 0),
    arrowup: () => actions.pan(0, -1),
    w: () => actions.pan(0, -1),
    arrowdown: () => actions.pan(0, 1),
    s: () => actions.pan(0, 1),
  };
  for (const { kind, key } of OVERLAYS) keys[key] = () => actions.toggleOverlay(kind);
  modules.forEach((id, i) => {
    if (i < 9) keys[String(i + 1)] = () => actions.pickModule(id);
  });

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === "z") {
      e.preventDefault();
      actions.undo();
      return;
    }
    const action = keys[key];
    if (!action || e.ctrlKey || e.metaKey || e.altKey) return;
    if (key === " ") e.preventDefault();
    action();
    actions.changed();
  });
}
