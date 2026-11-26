// Public interface of the simulation core. The view only imports from here.
export { createStation } from "./station";
export type { Station, PlacedModule, ModuleId, OrbitType } from "./station";
export { applyCommand } from "./commands";
export type { Command, CommandResult, RejectionReason } from "./commands";
export { checkPlacement, connectionsOf } from "./placement";
export type { PlacementCheck, Connection, ConnectionEnd } from "./placement";
export { footprintOf, portsOf, sizeOf } from "./geometry";
export type { GridCell, PlacedPort, Placement, Rotation } from "./geometry";
export { MODULE_TYPES } from "./content";
export type { ModuleType, ModuleTypeId, PortDefinition, Side } from "./content";
