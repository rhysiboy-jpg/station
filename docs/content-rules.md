# Content rules: resources, units and parts

_The rules every **Module**, piece of **Equipment**, **Resource** and **Challenge** follows, so new parts fit the game without fresh design work each time. Terms in **bold** are defined in [GLOSSARY.md](../GLOSSARY.md). The data lives in [`src/sim/content.ts`](../src/sim/content.ts)._

Rules marked **[tested]** are checked by [`src/sim/content.test.ts`](../src/sim/content.test.ts), so a part that breaks one fails CI. The others are guidelines: follow them unless there is a reason not to, and write the reason down. If a new part genuinely needs to break a rule, change the rule here first (with why), then the test.

## The golden rules

1. **Start from a real figure, then bend it for fun, and write down every bend.** Every number begins as a real-world value (ISS where possible). Any change goes in the balance changes list in [design.md](design.md), with the reason.
2. **Content is data.** A new part is an entry in `content.ts`, not new code. If it needs new code, it's a new *role* or *resource* (see below), and that is a design decision.
3. **Use the glossary's words.** Name things as [GLOSSARY.md](../GLOSSARY.md) does, in code, UI text and docs. Don't use the words it lists under _Avoid_.
4. **Layout must matter.** A part earns its place by creating a placement choice: where it goes, what it sits next to, or what it needs to reach.

## Units (U1)

One set of units everywhere. Rates are per real time unit, never per tick, so the game clock can change without retuning content.

| Quantity | Unit | Notes |
|---|---|---|
| Time step | **tick** = 4.6 s of game time | **[tested]** 1,200 ticks = one 92-minute low Earth **Orbit** = 2 minutes at 1x. |
| Orbit | 60% **Day**, 40% **Eclipse** | |
| Power | kW | Draw, solar output, port ratings. |
| Energy | kWh | Battery storage. |
| Heat | kW | Heat made, rejected, carried. |
| Thermal mass | kJ per °C | How much heat warms a module by 1 °C. |
| Temperature | °C | Set point 21 °C. |
| Gas | kg held; kPa partial pressure for limits | Fresh air is 21 kPa O2. |
| Fan exchange | m³ per second | Air swapped across a **Connection**. |
| Volume | m³ | Pressurised volume. |
| Water | kg; rates in kg per day | |
| Crew needs | per person per day | 0.84 kg O2, 1 kg CO2, 3 kg water, 0.1 kW heat. |
| Data | GB; rates in GB per hour | |
| Durations in rules | ticks, or orbits | Grace periods are a quarter orbit (300 ticks). |

## Resources

There are five resources. Each moves through its own **Network** of connected modules.

| Resource | Carried by | Limited at connections? | Held | Made by | Used by |
|---|---|---|---|---|---|
| Power | every module | yes, port rating in kW | batteries | solar panels (Day only) | module systems, equipment |
| Heat | every module | yes, port rating in kW | each module's temperature (thermal mass) | everything powered, crew | removed by radiators; leaks between attached modules |
| Air | pressurised modules only | yes, fan exchange in m³/s | per module ([ADR 0005](adr/0005-per-module-air.md)) | oxygen generator / CO2 scrubber | crew |
| Water | pressurised modules only | no, unlimited ([ADR 0003](adr/0003-shared-networks-not-routed-conduits.md)) | tanks pooled per network | recycler wins back used water | crew, oxygen generator |
| Data | every module | no, unlimited (ADR 0003) | data storage | lab racks (with crew) | antennas send it to Earth |

**R1. Connection limits.** A connection carries the lower of its two modules' port ratings for each limited resource. A resource gets no limit only if no plausible pipe or line could ever bind it; record that in ADR 0003.

**R2. Shortage rule.** When power is short, equipment is shed by priority tier (see E3), never at random, and item by item: within a tier a module runs as many pieces as fit, in slot-then-hardpoint order. Each tier may run batteries only down to its floor: tier 1 to empty, tier 2 to 15%, tier 3 to 30%, tier 4 to 50% ([ADR 0004](adr/0004-power-shortages-shed-by-priority.md)).

**R3. Warnings.** Every resource that can hurt the station has yellow and red limits in data (`TEMPERATURE_LIMITS`, `AIR_LIMITS`, `WATER_LOW_FRACTION`). Red for a quarter orbit takes a module offline. Power warns but never takes a module offline by itself.

**R4. One colour per network.** Power cyan, heat orange, air mint, water blue, data violet, set in `src/view/palette.ts` and `src/style.css`. Yellow and red are for warnings only.

## Modules

| Rule | |
|---|---|
| **M1** **[tested]** | A whole-cell rectangle with at least one **Port**. Sizes are small: 1×1 to 2×3 so far. |
| **M2** **[tested]** | Ports and **Hardpoints** sit on the module's outer edges, at most one per cell edge, and never share an edge. Listed for rotation 0. |
| **M3** **[tested]** | **Pressurised** if and only if it has volume, crew room and fans. Unpressurised parts (truss) carry power, heat and data only. |
| **M4** **[tested]** | Water tanks and beds only in pressurised modules. Beds never exceed the module's crew room. |
| **M5** **[tested]** | Thermal mass is 300 kJ/°C per grid cell. |
| **M6** **[tested]** | Port ratings are positive, and heat never exceeds power. Guide: heat ≈ ⅔ of power. Truss is the trunk (15 kW / 10 kW), corridors are narrow (6 / 4), working modules sit between (8 to 12 / 6 to 8). |
| **M7** **[tested]** | Its own systems draw no more than 0.2 kW per cell. Guide: about 0.1 kW per pressurised cell; hubs with avionics may draw more (core node 0.2 kW in one cell); corridors and truss draw little or nothing. |
| M8 | Volume about 20 m³ per pressurised cell (corridors about 10). |
| M9 | Crew room by purpose: 2 for small and passing-through modules (core node, corridor, life support module), about one person per 20 m³ for working space (lab 4), more for living space (habitat 6). |
| M10 | Slots and hardpoints create the trade-off: more of either makes a module more useful but competes with packing it tightly. Give each module a clear job: living (beds), working (slots for racks), life support (slots and a tank), connecting (ports), or structure (hardpoints). |
| M11 | Port ratings, tanks, beds and crew room go in the module's data, never as special cases in code. |

## Equipment

| Rule | |
|---|---|
| **E1** **[tested]** | Exactly one **role**, given by its role fields. The roles so far: |

| Role | Role fields | Mount | Priority | Example |
|---|---|---|---|---|
| power | `solar` (kW) | external | 1 | solar panel |
| storage | `storage` (kWh) | internal | 1 | battery |
| air | `oxygenPerDay`, `co2PerDay` (kg/day) | internal | 1 | oxygen generator / CO2 scrubber |
| water | `recovery` (0 to 1), `waterPerDay` (kg/day) | internal | 2 | water recycler |
| cooling | `rejects` (kW) | external | 3 | radiator |
| science | `dataPerHour` (GB/h) | internal | 4 | lab rack |
| comms | `downlinkPerHour` (GB/h) | external | 4 | antenna |
| records | `dataStorage` (GB) | internal | 4 | data storage |

| Rule | |
|---|---|
| **E2** **[tested]** | It mounts where its role needs: **external** (a hardpoint) for anything that needs sunlight, open space to shed heat, or a view of Earth; **internal** (a slot) otherwise. |
| **E3** **[tested]** | It sheds at its role's priority tier ([ADR 0004](adr/0004-power-shortages-shed-by-priority.md)): 1 keeps the crew breathing, 2 is life support that can wait, 3 is cooling, 4 is science and comms. A module's own systems are tier 1. |
| **E4** **[tested]** | It draws power unless it is a source or a store. Anything active (pumps, electronics, electrolysis) draws. |
| **E5** **[tested]** | Life support is sized for one habitat's beds (4 crew), with at most 15% headroom. This keeps "one habitat, one life support set" as the unit players reason in. |
| E6 | Every piece of equipment makes heat equal to the power it draws. No special heat values. |
| E7 | Recovery below 100% always. Recycling loses something, so resupply or better parts matter later. |
| E8 | Crew-tended equipment states its crew ratio (lab racks: one crew member tends `RACKS_PER_CREW` = 2). |
| E9 | Ratios between partner parts are deliberate and written next to the data. Today: 1 antenna keeps up with 3 lab racks; 1 radiator (3 kW) rejects a little over half a solar panel (5.4 kW); 20 GB of storage is about 5 hours of a full lab. |

## Naming (N1) **[tested]**

- Ids are kebab-case (`life-support`, `water-recycler`).
- `short` is 2 to 5 capitals or digits, unique among modules (it's drawn on the module).
- Names are unique, and in sentence case ("Life support module").

## Challenges (C1) **[tested]**

- A length in orbits, at least one **Hold** or **Goal**, and a one-line brief ending with a full stop (100 characters at most).
- Each challenge leans mainly on one system, so the set covers power, heat, life support and data.
- Prove a new challenge winnable with a test that builds a station and wins it, as `challenge.test.ts` does for Night shift.

## Checklists

### Adding a module

1. Add the entry to `MODULE_TYPES` with every field (the type system requires them).
2. Follow M1 to M11, then run `npm test`. The content rules test it automatically.
3. Check it on screen: does its short label fit, and are its ports and hardpoints readable?
4. Add a build test if it introduces a new placement case.
5. Record any bend from real figures in the balance changes list.

### Adding a piece of equipment

1. Give it an existing role if one fits; otherwise see "Adding a role" below.
2. Add the entry to `EQUIPMENT_TYPES`, with its role fields, mount (E2), priority (E3) and draw (E4).
3. Pick its swatch: its network's colour, in `equipmentColour` in `src/view/palette.ts`.
4. Run `npm test`.

### Adding a role (new kind of equipment behaviour)

This is code, not just content, so it is a design decision.

1. Add the role field(s) to `EquipmentType` with units in the doc comment.
2. Add the role to `ROLES` in `content.test.ts` with its mount and priority, and to the table above.
3. Implement it in the system it belongs to (`power.ts`, `heat.ts`, `lifeSupport.ts`, `data.ts`), reading the field from data.
4. Test it through the core's public interface.

### Adding a resource

The largest change. Plan it with `/grill-with-docs` first.

1. Add it to `Resource` and to `carries()` (which modules carry it).
2. Decide R1: limited at connections (add a rating to every module's `capacity`) or unlimited (record why in ADR 0003).
3. Decide R3: its warning limits, in data, and whether it counts towards going offline.
4. Give it a network colour (R4), an overlay with a key, and status rows.
5. Add its state to `Station`, bump `SAVE_VERSION`, and teach `loadStation` to upgrade older saves. The save guard test fails until you do.
6. Add its reference figures and any bends to [design.md](design.md).

### Adding a challenge

Add it to `CHALLENGES` following C1, then add a test that wins it.

## Where the numbers live

| What | Where |
|---|---|
| Module and equipment figures | `MODULE_TYPES`, `EQUIPMENT_TYPES` in `content.ts` |
| Crew needs | `CREW` |
| Priorities and battery floors | `BATTERY_FLOORS`, `MODULE_SYSTEMS_PRIORITY`, `LOWEST_PRIORITY` |
| Warning limits and grace | `TEMPERATURE_LIMITS`, `AIR_LIMITS`, `WATER_LOW_FRACTION`, `OFFLINE_AFTER_TICKS` |
| Heat behaviour | `NOMINAL_TEMPERATURE`, `HEAT_LEAK_KW_PER_C`, `HEAT_RECOVERY_SECONDS` |
| Crew tending | `RACKS_PER_CREW` |
| Challenges | `CHALLENGES`, `CHALLENGE_LAPSE_TICKS` |
| Game clock | `TICKS_PER_ORBIT`, `SECONDS_PER_TICK`, `DAY_FRACTION` in `time.ts` |
| Why the numbers differ from reality | balance changes list in [design.md](design.md) |
