# Difficulty decides whether an offline module cuts its networks

When a **Module** goes **Offline**, its own equipment and crew are out, but what happens to the **Networks** it sits on was a genuine trade-off: keep carrying resources through (failure stays local, as the design's "problems are local and recoverable" asks) or cut them (dramatic cascades, and redundant **Connections** become worth building). Rather than pick one, the station has a **Difficulty** setting. On **Standard** (the default) the offline module's hull still carries power, heat, air, water and data through to the modules beyond; on **Hard** it drops out of every network, splitting the station, and evacuating crew can't pass through it. Difficulty is a station setting, not a build change, so undo doesn't revert it, and it is saved with the station.

## Consequences

- Network formation depends on station state (`offline` plus `difficulty`), not only the layout, so networks are recomputed every tick rather than cached on layout changes.
- Batteries and water tanks in a module that is cut out keep what they hold until it recovers.
- Further difficulty levers (failure grace period, recovery rules) can join this setting later rather than becoming separate options.
