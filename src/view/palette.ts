// Schematic / blueprint colours. One colour per network, used everywhere that
// network appears; yellow and red are kept for warnings and nothing else.
// Keep in step with the matching custom properties in style.css.
import type { EquipmentTypeId } from "../sim";

/** One colour per network (overlays, inspector, totals, equipment swatches). */
export const network = {
  power: 0x3fd2ff,
  heat: 0xff9446,
  air: 0x4fe3a1,
  water: 0x5a7dff,
  data: 0xc58cff,
};

export const palette = {
  background: 0x0b1a2e,
  gridMinor: 0x16304f,
  gridMajor: 0x1f4470,
  moduleFill: 0x123a63,
  moduleOutline: 0xcfe3ff,
  trussOutline: 0x8fa9c9,
  label: 0xcfe3ff,
  portFree: 0x7fd4ff,
  portJoined: 0xffffff,
  hardpointFree: 0x4f78a8,
  /** Placement previews. */
  valid: 0x8be08b,
  invalid: 0xff4d5e,
  selected: 0xffffff,
  ...network,
  // Warning levels, shared by every overlay and status. Nothing else uses these.
  warning: 0xffe14d,
  danger: 0xff4d5e,
  offline: 0x6f8db3,
  // Power overlay states, in warning terms: shedding is a yellow, dark is a red.
  unpowered: 0xff4d5e,
  shedding: 0xffe14d,
};

/** Equipment swatches take their network's colour. */
export const equipmentColour: Record<EquipmentTypeId, number> = {
  "solar-panel": network.power,
  battery: 0x9be9ff,
  radiator: network.heat,
  "oxygen-generator": network.air,
  "water-recycler": network.water,
  "lab-rack": network.data,
  "data-storage": 0xa46cf0,
  antenna: 0xdcc2ff,
};
