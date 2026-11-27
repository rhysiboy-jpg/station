// Challenges: goals set in the sandbox. Holds must stay true for the whole
// challenge (with a short grace for lapses); goals must be met before time
// runs out. Abandoning the station fails any challenge.
import {
  CHALLENGE_LAPSE_TICKS,
  CHALLENGES,
  NOMINAL_TEMPERATURE,
  type Challenge,
  type ChallengeId,
  type Goal,
  type Hold,
} from "./content";
import { dataFlows } from "./data";
import { powerReport, type PowerReport } from "./power";
import { crewOf, type ChallengeRun, type Station } from "./station";
import { TICKS_PER_ORBIT } from "./time";

export interface HoldProgress {
  kind: Hold["kind"];
  label: string;
  /** The reading now: crew, racks or °C. */
  value: number;
  met: boolean;
  /** Ticks left before an unmet hold fails the challenge; null while met. */
  ticksToFail: number | null;
}

export interface GoalProgress {
  kind: Goal["kind"];
  label: string;
  value: number;
  target: number;
  met: boolean;
}

export interface ChallengeProgress {
  challenge: Challenge;
  outcome: ChallengeRun["outcome"];
  failedBecause: string | null;
  orbitsDone: number;
  holds: HoldProgress[];
  goals: GoalProgress[];
}

export function challengeById(id: ChallengeId): Challenge {
  return CHALLENGES.find((c) => c.id === id) as Challenge;
}

function holdLabel(hold: Hold): string {
  switch (hold.kind) {
    case "crew":
      return `${hold.atLeast} crew aboard`;
    case "racks":
      return `${hold.atLeast} lab racks working`;
    case "coolerThan":
      return `Every module below ${hold.celsius} °C`;
  }
}

function holdReading(station: Station, hold: Hold, power: PowerReport): { value: number; met: boolean } {
  switch (hold.kind) {
    case "crew": {
      const value = crewOf(station.modules);
      return { value, met: value >= hold.atLeast };
    }
    case "racks": {
      const data = dataFlows(station, power);
      const value = Object.values(data.modules).reduce((sum, m) => sum + m.racksWorking, 0);
      return { value, met: value >= hold.atLeast };
    }
    case "coolerThan": {
      const value = Math.max(...station.modules.map((m) => station.temperature[m.id] ?? NOMINAL_TEMPERATURE));
      return { value, met: value < hold.celsius };
    }
  }
}

function goalReading(station: Station, run: ChallengeRun, goal: Goal): GoalProgress {
  const value = station.downlinked - run.downlinkedAtStart;
  return { kind: goal.kind, label: `Send ${goal.atLeast} GB to Earth`, value, target: goal.atLeast, met: value >= goal.atLeast };
}

/** The current challenge's progress, or null in free play. */
export function challengeOf(station: Station, power?: PowerReport): ChallengeProgress | null {
  const run = station.challenge;
  if (!run) return null;
  const challenge = challengeById(run.id);
  const report = power ?? powerReport(station, false);
  const until = run.endedTick ?? station.tick;
  return {
    challenge,
    outcome: run.outcome,
    failedBecause: run.failedBecause,
    orbitsDone: (until - run.startTick) / TICKS_PER_ORBIT,
    holds: challenge.holds.map((hold, i) => {
      const reading = holdReading(station, hold, report);
      const lapse = run.lapses[i] ?? 0;
      return {
        kind: hold.kind,
        label: holdLabel(hold),
        ...reading,
        ticksToFail: reading.met || run.outcome !== "running" ? null : CHALLENGE_LAPSE_TICKS - lapse,
      };
    }),
    goals: challenge.goals.map((goal) => goalReading(station, run, goal)),
  };
}

/** Starts a challenge on the station as it stands. */
export function startChallenge(station: Station, id: ChallengeId): ChallengeRun {
  return {
    id,
    startTick: station.tick,
    downlinkedAtStart: station.downlinked,
    lapses: challengeById(id).holds.map(() => 0),
    outcome: "running",
    endedTick: null,
    failedBecause: null,
  };
}

/** One tick of challenge judging, from the tick's starting state like every other system. */
export function stepChallenge(station: Station, power: PowerReport): Pick<Station, "challenge"> {
  const run = station.challenge;
  if (!run || run.outcome !== "running") return { challenge: run };
  const challenge = challengeById(run.id);
  const tick = station.tick + 1;
  const end = (outcome: "won" | "failed", failedBecause: string | null): Pick<Station, "challenge"> => ({
    challenge: { ...run, outcome, endedTick: tick, failedBecause },
  });

  if (station.abandoned) return end("failed", "The station was abandoned.");

  const lapses = challenge.holds.map((hold, i) => (holdReading(station, hold, power).met ? 0 : (run.lapses[i] ?? 0) + 1));
  const broken = lapses.findIndex((lapse) => lapse > CHALLENGE_LAPSE_TICKS);
  if (broken !== -1) {
    const hold = challenge.holds[broken] as Hold;
    return end("failed", `Lost “${holdLabel(hold)}” for more than a quarter orbit.`);
  }

  const goalsMet = challenge.goals.every((goal) => goalReading(station, run, goal).met);
  const timeUp = tick - run.startTick >= challenge.orbits * TICKS_PER_ORBIT;
  if (challenge.goals.length > 0 && goalsMet) return end("won", null);
  if (timeUp) return goalsMet ? end("won", null) : end("failed", "Time ran out before the goal was met.");
  return { challenge: { ...run, lapses } };
}
