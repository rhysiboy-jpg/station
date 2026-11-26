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

Only **pressurised** modules join the air network.

### Power shortages

When a power network can't meet demand, equipment is **shed** in priority tiers, like an ISS load-shed list ([ADR 0004](adr/0004-power-shortages-shed-by-priority.md)): science and comms go first, then cooling, then water, and the oxygen generator and the modules' own systems last. Each tier may run batteries down only to its own floor (50%, 30%, 15%, empty), so life support outlasts the labs through **eclipse**. Shed equipment restarts once sunlight alone covers it or the batteries are full. Priorities and floors are data; player-set priorities may follow if playtests ask for them. Later resources, in rough order: fuel (reboosts in low orbit), food, spare parts, radiation.

### Reference figures (starting points, to be tuned)

Approximate real-world values to start balancing from. Every deviation goes in a "balance changes" list in this document.

- Oxygen: about 0.84 kg per person per day. CO2 produced: about 1 kg per person per day.
- Water: roughly 3 kg per person per day for drinking and food, before hygiene.
- ISS-class water recovery: 93 to 98%. Prototype recyclers sit around 85 to 95%, with better ones as upgrades.
- Low Earth orbit: about 92 minutes per orbit, up to about 36 minutes in shadow (around 40%). Sped up so one orbit takes a couple of minutes at 1x.
- Sunlight at Earth's distance: about 1,361 W per m², of which older panels turn roughly 14 to 30% into power.

### Balance changes

_None yet._

## Crew

The first version uses an abstract **headcount** per module: modules need N crew and crew need air, water and a habitat. Individual crew who walk around, with needs and repair jobs, come later.

## Failure

- Each module has thresholds (temperature, air, power). Crossing them raises a **yellow** then a **red** warning.
- Past red, the module goes **offline** and its crew move to an attached pressurised module.
- In the prototype a module recovers automatically once conditions are fixed. Repairs needing crew or spare parts come with the full game.
- Game over only if the whole station must be abandoned.

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
- A few **challenges**, for example "keep 6 crew alive and 2 labs running through 10 orbits".
- Screen: build palette, overlay toggles for each network, module inspector, time controls, alerts list, day/night and contact indicator.
- Autosaves in the browser, with export and import of save files to share layouts.
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
