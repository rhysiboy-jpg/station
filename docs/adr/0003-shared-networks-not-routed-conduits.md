# Shared resource networks, not hand-routed conduits

Resources move through **Networks** formed by **Modules** joined at **Ports**, with a capacity limit on each **Connection**, rather than through pipes and cables the player routes by hand. Routing is a lot of fiddly UI and simulation for a first version, while shared networks with bottleneck connections still make the layout matter. A reader expecting a colony-sim-style pipe layer should know this was deliberate; explicit conduits can be revisited if networks feel too abstract after playtesting.

## Connection capacities (added with the bottlenecks ticket)

Each **Connection** carries at most the lower of its two **Modules'** port ratings for each resource, set per module type in data (truss is the power and cooling trunk, corridors are narrow). Power and heat are routed through those limits each tick with a small max-flow solver: power by priority tier, so a lower tier never takes what a higher one needs, and heat shared fairly between the modules behind a full connection. Air already moves connection by connection ([ADR 0005](0005-per-module-air.md)), so each connection's fan rate is its air capacity. **Water is deliberately left unlimited**: crew use about 3 kg a day, so no plausible pipe would ever be the limit, and modelling one would only add tuning.
