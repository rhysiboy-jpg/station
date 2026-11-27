// Advancing the simulation tick by tick.
import { stepChallenge } from "./challenge";
import { stepData } from "./data";
import { stepFailure } from "./failure";
import { stepHeat } from "./heat";
import { stepLifeSupport } from "./lifeSupport";
import { powerReport, stepPower } from "./power";
import type { Station } from "./station";

/** Runs the simulation forward by a whole number of ticks. Never mutates. */
export function advance(station: Station, ticks: number): Station {
  let current = station;
  for (let i = 0; i < ticks; i++) current = step(current);
  return current;
}

/** Every system reads the same starting state and power verdict, so their order doesn't matter. */
function step(station: Station): Station {
  const power = powerReport(station, false);
  return {
    ...station,
    ...stepPower(station),
    ...stepLifeSupport(station, power),
    ...stepHeat(station, power),
    ...stepData(station, power),
    ...stepFailure(station, power),
    ...stepChallenge(station, power),
    tick: station.tick + 1,
  };
}
