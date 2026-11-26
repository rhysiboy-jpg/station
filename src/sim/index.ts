// Public interface of the simulation core. The view only imports from here.
export { createStation } from "./station";
export { advance } from "./simulation";
export { powerOf } from "./power";
export type { PowerReport, ModulePower, NetworkPower } from "./power";
export { networksOf } from "./networks";
export type { Network } from "./networks";
export { orbitOf, TICKS_PER_ORBIT, TICKS_PER_SECOND_AT_1X, SECONDS_PER_TICK } from "./time";
export type { OrbitState, OrbitPhase } from "./time";
export { hardpointsOf } from "./equipment";
export type { HardpointState, MountRef, Displaced } from "./equipment";
export type { Station, PlacedModule, ModuleId, OrbitType } from "./station";
export { applyCommand } from "./commands";
export type { Command, CommandResult, RejectionReason } from "./commands";
export { checkPlacement, connectionsOf } from "./placement";
export type { PlacementCheck, Connection, ConnectionEnd } from "./placement";
export { footprintOf, portsOf, sizeOf } from "./geometry";
export type { GridCell, PlacedPort, Placement, Rotation } from "./geometry";
export { MODULE_TYPES, EQUIPMENT_TYPES } from "./content";
export type {
  ModuleType,
  ModuleTypeId,
  PortDefinition,
  Side,
  EquipmentType,
  EquipmentTypeId,
  Mount,
  Resource,
} from "./content";
