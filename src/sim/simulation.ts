// Advancing the simulation tick by tick.
import { stepPower } from "./power";
import type { Station } from "./station";

/** Runs the simulation forward by a whole number of ticks. Never mutates. */
export function advance(station: Station, ticks: number): Station {
  let current = station;
  for (let i = 0; i < ticks; i++) current = step(current);
  return current;
}

function step(station: Station): Station {
  return { ...station, ...stepPower(station), tick: station.tick + 1 };
}
