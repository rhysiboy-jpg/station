# Deterministic, fixed-tick simulation

The simulation advances in fixed **Ticks**, and the same starting state plus the same commands always produce the same result. Speed controls only change how many ticks run per real second; they never change the size of a tick. This keeps the game behaving identically at every speed, makes the core straightforward to test, and makes saves, shared layouts and replays reliable. Consequence: no wall-clock time, `Math.random` or frame-rate-dependent maths inside the core; randomness, if needed, comes from a seeded generator stored in the state.
