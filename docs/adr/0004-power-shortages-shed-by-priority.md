# Power shortages shed equipment by priority, with battery floors and a restart gap

When a power **Network** can't meet demand, equipment is switched off in tiers by a fixed priority set in data (1 life-critical, 2 water, 3 cooling, 4 science and comms; a module's own systems count as tier 1), lowest priority first, until the rest fits. This mirrors the pre-planned load-shed lists ISS flight controllers use, keeps failures local and readable, and makes "what runs when power is short" a layout question rather than a coin toss.

Two further rules make the tiers hold up:

- **Battery floors.** Each tier may draw batteries only down to its own floor (tier 4 to 50%, tier 3 to 30%, tier 2 to 15%, tier 1 to empty). Without them, low-priority equipment drains the battery during **Eclipse** and life support goes dark at the same moment as the labs, so priority would only matter when sunlight is short. Comparable to ISS depth-of-discharge limits.
- **Restart gap.** A shed tier restarts only once sunlight alone covers it, or once the network's batteries are full. Restarting as soon as a tick's worth of charge appears makes equipment flicker on and off every few ticks. The gap needs a little saved state: the tier each module's network last ran at (`Station.powerRunningUpTo`). When networks merge, they take the most shed of their members.

## Considered options

- **All-or-nothing** (the first implementation): the whole network stops at once. Harsh, and a single lab rack could switch off the oxygen generator.
- **Proportional brownout**: everything runs at the same fraction. Smooth, but nothing is clearly off and all systems degrade together, which is hard to read.
- **Player-set priorities**: more control, but a new command, UI and saved field before we know it's needed. Can be layered on top of the data defaults after playtesting.

## Shedding item by item (revised after the prototype)

Shedding first worked a whole tier per module at once: if a connection couldn't carry all four of a lab's racks, all four stopped. It now works item by item. Each module's loads run in a fixed order (its own systems, then equipment by tier, then slot-then-hardpoint order), and a module always runs a prefix of that list: within a tier, as many items run as fit, and the rest are shed from the end. The restart gap applies per item, so an item beyond what ran last tick restarts only on sunlight alone or full batteries. The saved state is a count of loads running per module (`Station.powerLoadsRunning`, save version 3) rather than a tier. Less equipment sits idle, and it's closer to how real load-shed lists switch individual loads.
