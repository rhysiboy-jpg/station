// Public interface of the simulation core. The view only imports from here.
export { createStation } from "./station";
export { advance } from "./simulation";
export { powerOf } from "./power";
export type { PowerReport, ModulePower, NetworkPower, RunningUpTo, ShedReason, ShedTiers, JointFlow } from "./power";
export { lifeSupportOf } from "./lifeSupport";
export type { LifeSupportReport, ModuleAir, WaterNetwork } from "./lifeSupport";
export { dataOf } from "./data";
export type { DataReport, ModuleData, DataNetwork } from "./data";
export { saveStation, loadStation, SAVE_VERSION } from "./save";
export type { LoadResult } from "./save";
export { challengeOf, challengeById } from "./challenge";
export type { ChallengeProgress, HoldProgress, GoalProgress } from "./challenge";
export { failureOf } from "./failure";
export type { FailureReport, ModuleStatus, Warning, Condition, Level } from "./failure";
export { heatOf } from "./heat";
export type { HeatReport, ModuleHeat, HeatNetwork } from "./heat";
export { networksOf } from "./networks";
export type { Network } from "./networks";
export { orbitOf, TICKS_PER_ORBIT, TICKS_PER_SECOND_AT_1X, SECONDS_PER_TICK } from "./time";
export type { OrbitState, OrbitPhase } from "./time";
export { hardpointsOf } from "./equipment";
export type { HardpointState, MountRef, Displaced } from "./equipment";
export type { Station, PlacedModule, ModuleId, OrbitType, Air, ChallengeRun } from "./station";
export { applyCommand } from "./commands";
export type { Command, CommandResult, RejectionReason } from "./commands";
export { checkPlacement, connectionsOf } from "./placement";
export type { PlacementCheck, Connection, ConnectionEnd } from "./placement";
export { footprintOf, portsOf, sizeOf } from "./geometry";
export type { GridCell, PlacedPort, Placement, Rotation } from "./geometry";
export { MODULE_TYPES, EQUIPMENT_TYPES, LOWEST_PRIORITY, MODULE_SYSTEMS_PRIORITY, BATTERY_FLOORS,
  CREW,
  AIR_LIMITS,
  NOMINAL_O2_KPA,
  NOMINAL_TEMPERATURE,
  TEMPERATURE_LIMITS,
  OFFLINE_AFTER_TICKS,
  RACKS_PER_CREW,
  CHALLENGES,
  CHALLENGE_LAPSE_TICKS,
  DIFFICULTIES,
} from "./content";
export type {
  ModuleType,
  ModuleTypeId,
  PortDefinition,
  Side,
  EquipmentType,
  EquipmentTypeId,
  Mount,
  Resource,
  Priority,
  Difficulty,
  Challenge,
  ChallengeId,
  Hold,
  Goal,
} from "./content";
