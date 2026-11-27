# Station: game design

_Working title. Settled in a design grilling session on 2026-11-26. Terms in **bold** are defined in [GLOSSARY.md](../GLOSSARY.md)._

## Pitch

A browser game about designing a space station in grounded, near-future sci-fi. You are the engineer. The fun is the layout: every part you add has physical connections and side effects on its neighbours, so where things go matters as much as what you build.

## Pillars

1. **The layout is the puzzle.** Components connect at fixed points and affect what's around them (a reactor makes power, but also heat that leaks into the crew quarters next door). Packing tightly saves connections but costs outside surface for power and cooling.
2. **Plausible, not fantastical.** Start from real-world figures (oxygen per person, solar output, recycling rates) and only bend them for fun, writing down every change.
3. **Watch it run.** Real time with pause, so you see resources flow and failures cascade.
4. **Failure teaches, it doesn't end the game.** Problems are local and recoverable. Game over only if the whole station is abandoned.

## Player and structure

- **Role:** architect and engineer, with a light tycoon layer. Crew and money are pressures on the layout, not the main event.
- **View:** 2D top-down grid, one flat plane (no decks). 3D may come later once the direction is proven, which is why the simulation is kept separate from rendering ([ADR 0001](adr/0001-typescript-sim-core-separate-from-rendering.md)).
- **Time:** real time with pause and speed controls (pause, 1x, 3x, 10x) on a fixed, deterministic tick ([ADR 0002](adr/0002-deterministic-fixed-tick.md)).
- **Modes:** a long **campaign** that grows one station from a seed module, plus a **sandbox**. Hand-made scenarios can come later as content.

## Building

- **Modules** are rectangles on a square grid (1x1 node, 1x3 corridor, 2x3 habitat and so on). Each has **ports** at fixed points on its edges, and two modules join only where their ports line up.
- Inside, each module has **internal slots** for **equipment** (scrubbers, batteries, lab racks).
- Outside, each module has **hardpoints** for external equipment (solar panels, radiators, antennas). A hardpoint is **blocked** if another module is attached on that face.
- **Truss** is unpressurised: it carries power, heat and data but not air or crew, and has many hardpoints. It's the cheap way to hang panels and radiators away from living space.

## Resources and networks

Modules joined by ports form one shared **network** per resource. Each **connection** has a capacity limit, so bottlenecks are part of the layout. There's no hand-routing of pipes or cables ([ADR 0003](adr/0003-shared-networks-not-routed-conduits.md)).

| Resource | Made by | Used by | Tension |
|---|---|---|---|
| Power | Solar panels (sun only), batteries (store) | Almost everything powered | Orbital night: storage must cover the dark side |
| Heat | Everything powered, crew | Removed by radiators | An unbalanced loop warms every module on it; a little heat also leaks into directly attached modules |
| Air (O2 / CO2) | Oxygen generator / CO2 scrubber | Crew | Recycling below 100%, needs power |
| Water | Water recycler, resupply | Crew, oxygen generation | Recycling below 100% |
| Data | Lab racks | Sent to Earth by antennas | Stored on board until downlinked; in the full game, ground contact is only part of each orbit |

Only **pressurised** modules join the air network. Unlike the other resources, air isn't one shared pool: each pressurised module has its own O2 and CO2, and fans slowly mix it with attached modules, so a crowded habitat far from the scrubber goes bad first ([ADR 0005](adr/0005-per-module-air.md)). Water is pooled per network in tanks built into some modules. Later resources, in rough order: fuel (reboosts in low orbit), food, spare parts, radiation.

### Data

Lab racks make data only while powered and tended: each crew member tends two racks, so a full four-rack lab needs two crew. Data storage holds it and antennas send it to Earth, both needing power. Whatever has nowhere to go is lost and counted. Data has no limit at connections, like water. Ground contact is constant in the prototype; contact windows for part of each orbit come with the full game.

### Bottlenecks

Each **connection** carries only so much: the lower of its two modules' port ratings. Truss is the trunk (15 kW of power, 10 kW of heat), corridors are narrow (6 kW, 4 kW), and the other modules sit in between (8 to 12 kW, 6 to 8 kW). Power and heat are routed through those limits, so a station with power to spare can still leave modules short if everything funnels through one corridor, and radiators can't cool modules whose heat can't reach them. The power and heat overlays draw every connection filled by how much of it is in use, with bottlenecks in red; the Limits overlay (B) shows every connection at its busiest across power and heat, tags each bottleneck with what it limits (P, H), and marks modules left short of power. Air connections are fans that swap air by difference in concentration, so they never fill up and aren't shown. Water pipes have no limit ([ADR 0003](adr/0003-shared-networks-not-routed-conduits.md)).

### Power shortages

When a power network can't meet demand, equipment is **shed** in priority tiers, like an ISS load-shed list ([ADR 0004](adr/0004-power-shortages-shed-by-priority.md)): science and comms go first, then cooling, then water, and the oxygen generator and the modules' own systems last. Each tier may run batteries down only to its own floor (50%, 30%, 15%, empty), so life support outlasts the labs through **eclipse**. Shed equipment restarts once sunlight alone covers it or the batteries are full. Priorities and floors are data; player-set priorities may follow if playtests ask for them.

### Reference figures (starting points, to be tuned)

Approximate real-world values to start balancing from. Every deviation goes in a "balance changes" list in this document.

- Oxygen: about 0.84 kg per person per day. CO2 produced: about 1 kg per person per day.
- Water: roughly 3 kg per person per day for drinking and food, before hygiene.
- ISS-class water recovery: 93 to 98%. Prototype recyclers sit around 85 to 95%, with better ones as upgrades.
- Low Earth orbit: about 92 minutes per orbit, up to about 36 minutes in shadow (around 40%). Sped up so one orbit takes a couple of minutes at 1x.
- Sunlight at Earth's distance: about 1,361 W per m², of which older panels turn roughly 14 to 30% into power.

### Balance changes

Every place the game departs from the reference figures, and why.

- **Small water tanks.** Habitats hold 5 kg of water and life support modules 10 kg, a few bottles' worth. At real rates (about 3 kg per person per day, roughly 16 orbits a day) realistic tanks would only run dry after hundreds of orbits. With small tanks, 4 crew with no recycler run dry in about 20 orbits, so recycling matters within a sitting. _Provisional: see whether this feels right in play._
- **Low thermal mass.** Modules take about 300 kJ to warm by 1 °C per grid cell, far less than a real module's ~10 MJ/°C. This is so 1 kW of unshed heat reaches the yellow limit in about an orbit rather than a day.
- **Small radiators.** A radiator rejects 3 kW, against about 14 kW for an ISS radiator wing, to keep numbers at the prototype's scale.
- **Stylised data rates.** A lab rack makes 1 GB an hour, an antenna sends 3 GB an hour and data storage holds 20 GB. These are round numbers chosen so one antenna keeps up with three racks and a full lab fills storage in about five hours; real ISS science data volumes are far larger and vary wildly by experiment.
- **Crew rates are real**: 0.84 kg O2 used, 1 kg CO2 made and 3 kg water used per person per day, plus 100 W of body heat. CO2 builds to the yellow limit within a few orbits without a scrubber, as on the real ISS, where CO2 is the fast danger.

## Crew

The first version uses an abstract **headcount** per module: modules need N crew and crew need air, water and a habitat. Total crew is capped by habitat beds, and each module has room for a set number at once (habitat 6, lab 4, core node, corridor and life support module 2 each), which also limits where evacuated crew can go. Individual crew who walk around, with needs and repair jobs, come later.

## Failure

- Each module has thresholds for temperature, air (O2 and CO2), water and power. Crossing them raises a **yellow** then a **red** warning, and every current warning is listed in the alerts list.
- A module that stays red for a quarter orbit (about 30 s at 1x) goes **offline**. A countdown shows how long is left, and dropping back below red calls it off. While offline it makes, uses and stores nothing, and its crew move to the nearest reachable modules that are online with nothing in red, filling each up to its room. If they don't all fit, the station is abandoned.
- Some conditions only count with crew aboard. Temperature always counts. Air and water only count when the module has crew, because they only harm people: an empty module with stale air shows a warning but doesn't count down.
- Power never takes a module offline by itself. A dark module is a red warning, and the harm comes through its effects: scrubbers stop, radiators stop.
- An offline module recovers automatically once every reading that counts is back below yellow. Repairs needing crew or spare parts come with the full game.
- **Difficulty** decides what an offline module does to the networks it sits on. On **Standard** its hull still carries power, heat, air and water through to the modules beyond. On **Hard** it cuts them, splitting the station.
- The station is **abandoned**, the only game over, when crew must leave a module and nowhere fit is reachable. The banner says what drove them out.

## Campaign (direction only, detail deferred)

These set direction; the detail is designed after the prototype shows the core puzzle is fun.

- **Starting orbit**, chosen once per campaign:
  - **Low Earth orbit**: cheapest launches and frequent windows, about 40% of each orbit in darkness, drag means regular fuel for reboosts.
  - **Dawn-dusk sun-synchronous**: almost constant sunlight (few batteries), but one side always in sun makes cooling harder, and launches cost more.
  - **Geostationary**: very expensive launches and rare windows, near-constant sun, more radiation, but lucrative communications contracts.
  - Lunar orbit and Lagrange points later, as advanced options.
- **Supply:** early on, every module and piece of equipment is launched from Earth, with a money cost, a cargo limit per launch and launch windows. Manufacturing on the station from mined material is a later unlock; the move from "everything shipped up" to "self-sufficient" is the campaign's backbone.
- **Income:** **contracts** (host an experiment, refuel a passing ship, house tourists, test a new part) that ask for specific capabilities and pay money and tech unlocks.
- Building takes time and spacewalks; launches deliver parts.

## The prototype

The first milestone is a sandbox that answers one question: is the layout puzzle fun? Full spec: [docs/specs/prototype-sandbox.md](specs/prototype-sandbox.md).

- Low Earth orbit, free money, no contracts or launches, instant and undoable building.
- **Modules (6):** core node (ports on all four sides), habitat, life support module, lab, truss segment, corridor.
- **Equipment (8):** solar panel, radiator, battery, oxygen generator / CO2 scrubber, water recycler, lab rack, antenna, data storage.
- Day and night, heat, failures and warnings. Constant ground contact (contact windows come later).
- A few **challenges**, for example "keep 6 crew alive and 2 labs running through 10 orbits". Built as six: Shakedown, Night shift, Cool running, Science return, Long haul and Station keeping. A challenge starts from the station as it stands. Its **holds** (crew aboard, lab racks working, every module below a temperature) must stay true for its length, with a quarter-orbit grace for lapses; its **goals** (data sent to Earth) must be met before time runs out. Abandoning the station fails it.
- Screen: build palette, overlay toggles for each network, module inspector, time controls, alerts list, day/night and contact indicator.
- Autosaves in the browser, with export and import of save files to share layouts. Saves are versioned JSON checked in full on load, so a broken or hand-edited file is refused with a message. Undo history isn't saved.
- Published to GitHub Pages on each update.

## Look

A clean schematic or blueprint style: flat shapes, clear colour coding per network, readable overlays. Simple, but attractive. Prettier art once the game is proven.

## Deferred

Revisit after the prototype has been played:

- Decks or 3D.
- Full campaign detail: contract list, tech tree, manufacturing and mining, events.
- Individual walking crew.
- Hand-routed conduits, if shared networks feel too abstract.
- A real name.
