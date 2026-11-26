// Schematic / blueprint colours. Network colours join this as overlays arrive.
import type { EquipmentTypeId } from "../sim";

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
  valid: 0x5fe3a1,
  invalid: 0xff6b6b,
  selected: 0xffd166,
  power: 0xffd166,
  unpowered: 0xff6b6b,
};

export const equipmentColour: Record<EquipmentTypeId, number> = {
  "solar-panel": 0x2f6fd0,
  radiator: 0xdfe8f2,
  antenna: 0xb8c7d9,
  battery: 0xffd166,
  "oxygen-generator": 0x5fe3a1,
  "water-recycler": 0x5fb8ff,
  "lab-rack": 0xc39bff,
  "data-storage": 0xff9f6b,
};
