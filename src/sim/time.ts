// The simulation clock (ADR 0002): fixed ticks, a repeating orbit of Day and Eclipse.
import type { Station } from "./station";

/** Ticks per real second at 1x. Speed controls run more ticks per second, never bigger ones. */
export const TICKS_PER_SECOND_AT_1X = 10;

/** One orbit is two minutes at 1x. */
export const TICKS_PER_ORBIT = 1200;

/** Share of each orbit in sunlight. Low Earth orbit is about 60% day, 40% eclipse. */
export const DAY_FRACTION = 0.6;

export const DAY_TICKS = Math.round(TICKS_PER_ORBIT * DAY_FRACTION);

/**
 * Simulated seconds per tick. A real low Earth orbit is about 92 minutes, so each
 * tick stands for 92 * 60 / 1200 = 4.6 seconds. Power and life support use this, so
 * real-world rates (kW, kg per day) carry over without rescaling.
 */
export const SECONDS_PER_TICK = (92 * 60) / TICKS_PER_ORBIT;

export type OrbitPhase = "day" | "eclipse";

export interface OrbitState {
  /** 1 for the first orbit. */
  orbit: number;
  phase: OrbitPhase;
  ticksToNextPhase: number;
  /** 0 to 1 through the current orbit. */
  progress: number;
}

export function orbitOf(station: Station): OrbitState {
  const inOrbit = station.tick % TICKS_PER_ORBIT;
  const day = inOrbit < DAY_TICKS;
  return {
    orbit: Math.floor(station.tick / TICKS_PER_ORBIT) + 1,
    phase: day ? "day" : "eclipse",
    ticksToNextPhase: day ? DAY_TICKS - inOrbit : TICKS_PER_ORBIT - inOrbit,
    progress: inOrbit / TICKS_PER_ORBIT,
  };
}
