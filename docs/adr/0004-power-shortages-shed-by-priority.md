# Power shortages shed equipment by priority, with battery floors and a restart gap

When a power **Network** can't meet demand, equipment is switched off in tiers by a fixed priority set in data (1 life-critical, 2 water, 3 cooling, 4 science and comms; a module's own systems count as tier 1), lowest priority first, until the rest fits. This mirrors the pre-planned load-shed lists ISS flight controllers use, keeps failures local and readable, and makes "what runs when power is short" a layout question rather than a coin toss.

Two further rules make the tiers hold up:

- **Battery floors.** Each tier may draw batteries only down to its own floor (tier 4 to 50%, tier 3 to 30%, tier 2 to 15%, tier 1 to empty). Without them, low-priority equipment drains the battery during **Eclipse** and life support goes dark at the same moment as the labs, so priority would only matter when sunlight is short. Comparable to ISS depth-of-discharge limits.
- **Restart gap.** A shed tier restarts only once sunlight alone covers it, or once the network's batteries are full. Restarting as soon as a tick's worth of charge appears makes equipment flicker on and off every few ticks. The gap needs a little saved state: the tier each module's network last ran at (`Station.powerRunningUpTo`). When networks merge, they take the most shed of their members.

## Considered options

- **All-or-nothing** (the first implementation): the whole network stops at once. Harsh, and a single lab rack could switch off the oxygen generator.
- **Proportional brownout**: everything runs at the same fraction. Smooth, but nothing is clearly off and all systems degrade together, which is hard to read.
- **Player-set priorities**: more control, but a new command, UI and saved field before we know it's needed. Can be layered on top of the data defaults after playtesting.
