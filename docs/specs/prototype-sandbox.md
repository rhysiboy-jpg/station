# Spec: prototype sandbox

_Status: built (tickets #2 to #13). Next: playtest, then update the design doc before designing the campaign. Vocabulary follows [GLOSSARY.md](../../GLOSSARY.md); design context in [design.md](../design.md)._

## Problem Statement

I have a design for a station-building game whose whole bet is that laying out connected **Modules**, with their side effects on each other, is a fun puzzle. Before building an economy, campaign or crew AI, I need to know whether that bet pays off. Right now there is nothing to play.

## Solution

A small browser sandbox in low Earth orbit where I can place and connect **Modules**, fit **Equipment**, press play and watch power, heat, air, water and data flow through **Networks** across **Day** and **Eclipse**. Things warn and go **Offline** when the layout can't cope, and recover when I fix it. A few **Challenges** give me something to aim for. Money is free and building is instant, so the only thing being tested is the layout puzzle. It autosaves, layouts can be shared as files, and it's playable from a public link.

## User Stories

### Building

1. As a player, I want to pick a **Module** type from a build palette, so that I can add it to my **Station**.
2. As a player, I want to see a placement preview that shows whether the **Module** fits, so that I don't guess.
3. As a player, I want **Modules** to join only where their **Ports** line up, so that layout choices matter.
4. As a player, I want to rotate a **Module** before placing it, so that I can line up its **Ports**.
5. As a player, I want to start from a single core node, so that every station grows from one seed.
6. As a player, I want to be prevented from placing a **Module** that overlaps another or connects to nothing, so that the station stays one connected structure.
7. As a player, I want to remove a **Module** instantly, so that I can experiment freely.
8. As a player, I want to undo my last build actions, so that mistakes cost nothing in the prototype.
9. As a player, I want to fit internal **Equipment** into a **Module**'s **Slots**, so that I can choose what each module does.
10. As a player, I want to fit external **Equipment** onto **Hardpoints**, so that I can add solar panels, radiators and antennas.
11. As a player, I want **Hardpoints** covered by an attached **Module** to show as **Blocked**, so that I see the cost of packing tightly.
12. As a player, I want equipment on a hardpoint that becomes **Blocked** to be removed (and shown to me), so that the rule is consistent.
13. As a player, I want **Truss** segments that carry power, heat and data but not air or crew, so that I can hang panels and radiators away from living space.
14. As a player, I want corridors that connect **Pressurised** modules, so that I can spread the station out.

### Simulation

15. As a player, I want to pause, play at 1x, 3x and 10x, so that I can plan calmly and then watch it run.
16. As a player, I want the station to behave the same at every speed, so that fast-forwarding doesn't change outcomes.
17. As a player, I want solar panels to make power only during **Day**, so that I need batteries for **Eclipse**.
18. As a player, I want batteries to charge from surplus and discharge in deficit, so that storage is a real choice.
19. As a player, I want powered equipment to stop working when its **Network** runs out of power, so that shortages have consequences.
20. As a player, I want every powered piece of equipment and every crew member to make heat, so that cooling is always a concern.
21. As a player, I want radiators to remove heat from their heat **Network**, so that I can balance it.
22. As a player, I want modules on an unbalanced heat network to warm up over time, so that I can see a problem building before it fails.
23. As a player, I want a little heat to leak between directly attached modules, so that placing a hot module beside the habitat is a real mistake.
24. As a player, I want crew to consume oxygen and water and produce CO2, so that life support matters.
25. As a player, I want the oxygen generator / CO2 scrubber and water recycler to recover less than 100%, so that the gap is visible and better layouts reduce it.
26. As a player, I want air to flow only through **Pressurised** modules, so that truss doesn't count as living space.
27. As a player, I want lab racks to produce data while powered and crewed, so that labs have a purpose.
28. As a player, I want data stored in data storage until antennas **Downlink** it, so that communications is part of the layout.
29. As a player, I want each **Connection** to have a capacity limit, so that a single narrow joint can become a bottleneck.
30. As a player, I want to assign a **Headcount** to modules that need crew, so that I decide where people work and live.
31. As a player, I want habitats to limit how many crew the station can hold, so that crew growth needs living space.
32. As a player, I want simulation figures to start from real-world values, so that the game feels grounded.

### Failure

33. As a player, I want a yellow **Warning** when a module nears a limit (temperature, air, power), so that I can act early.
34. As a player, I want a red **Warning** when it is about to fail, so that the urgency is clear.
35. As a player, I want a module past red to go **Offline** and move its crew to an attached pressurised module, so that failure is local.
36. As a player, I want an **Offline** module to recover once conditions are fixed, so that I can learn from failures without starting over.
37. As a player, I want the station to be **Abandoned** if no pressurised module can hold crew, so that there is a true fail state.
38. As a player, I want an alerts list of current **Warnings**, so that I don't miss a problem off-screen.

### Seeing what's happening

39. As a player, I want overlay toggles for each **Network** (power, heat, air, water, data), so that I can read one system at a time.
40. As a player, I want bottleneck **Connections** highlighted in an overlay, so that I can find what limits my layout.
41. As a player, I want to click a module and see what it takes in, puts out and stores, so that I can diagnose it.
42. As a player, I want a day/night and contact indicator, so that I know when eclipse is coming.
43. As a player, I want station-wide totals (power balance, heat balance, oxygen, water, data downlinked), so that I can see overall health.
44. As a player, I want a clean schematic look with clear colours per network, so that the station is easy to read and pleasant to look at.

### Challenges

45. As a player, I want to pick a **Challenge** such as "keep 6 crew alive and 2 labs running through 10 orbits", so that I have a goal.
46. As a player, I want to see progress towards the current challenge, so that I know how I'm doing.
47. As a player, I want to be told when I complete or fail a challenge, so that there's a clear outcome.
48. As a player, I want free play with no challenge, so that I can just experiment.

### Saving and sharing

49. As a player, I want the game to autosave in the browser, so that closing the tab doesn't lose my station.
50. As a player, I want to export my station to a file, so that I can share a layout.
51. As a player, I want to import a station file, so that I can load someone else's layout.
52. As a player, I want a clear message when an imported file is invalid, so that a bad file doesn't break my game.
53. As a player, I want to start a new station, so that I can try a different approach.
54. As a playtester, I want to play the latest version from a public link, so that I don't need to install anything.

## Implementation Decisions

- **One seam: the simulation core.** The core is a plain TypeScript module with no rendering or browser dependencies ([ADR 0001](../adr/0001-typescript-sim-core-separate-from-rendering.md)). Its public interface is roughly:
  - create a new **Station** (starting with a core node in low Earth orbit);
  - apply a **command** (place module, remove module, fit equipment, remove equipment, set headcount, undo), returning success or a reason for rejection;
  - advance by N **Ticks**;
  - read state: modules, equipment, networks, per-module resource readings, warnings, orbit phase, totals, challenge progress;
  - serialise to and from a versioned save format.
  The rendering and UI layer only uses this interface.
- **Determinism** ([ADR 0002](../adr/0002-deterministic-fixed-tick.md)): fixed tick size, no wall-clock time or unseeded randomness in the core. Speed controls run more ticks per second.
- **Content as data.** Module and equipment types (size, ports, slots, hardpoints, production, consumption, heat, capacities, thresholds) are defined as data tables, not code, so balancing is editing numbers. Starting values come from the reference figures in the design doc.
- **Networks** ([ADR 0003](../adr/0003-shared-networks-not-routed-conduits.md)) are recomputed from the module graph when the layout changes. Each tick resolves production, storage and consumption per network, limited by connection capacities.
- **Heat** uses a per-module temperature. The heat network moves heat towards radiators; leakage between directly attached modules is a separate small transfer.
- **Orbit** is a repeating cycle with a Day and an Eclipse portion (about 60/40), scaled so one orbit is a couple of minutes at 1x. Ground contact is constant in the prototype.
- **Failure** is a per-module state machine: normal → yellow → red → offline → (recovered) normal, driven by thresholds in the data tables.
- **Saves** are JSON with a version number. Autosave to browser storage; export/import as a file.
- **Rendering** is PixiJS 2D in a schematic style, with HTML UI for palette, inspector, alerts and time controls.
- **Hosting**: static build published to GitHub Pages from the main branch.

## Testing Decisions

- Good tests exercise external behaviour through the simulation core's public interface (commands in, ticks, state out), never its internals. Example: "a habitat with 4 crew and no oxygen generator drops below the yellow air threshold within N ticks".
- The simulation core is tested thoroughly, test-first: placement rules, port alignment, hardpoint blocking, network formation, connection bottlenecks, power through day and eclipse, heat balance and leakage, life support and recycling rates, data downlink, warnings and recovery, abandonment, challenge completion, undo, save round-trips, and determinism (same commands give identical state).
- The UI gets a small number of browser smoke tests (load, place a module, run time, see an overlay) rather than detailed tests.
- No prior art exists in the repo yet; these tests set the pattern.

## Out of Scope

Money, contracts, launches and launch windows, construction time and spacewalks, orbit choice (low Earth orbit only), reboosts and fuel, food, spare parts, radiation, ground contact windows, individual walking crew, repairs, decks, 3D, sound, mobile layout, multiplayer.

## Further Notes

- The aim of the prototype is a judgement: is the layout puzzle fun? After playtesting, update the design doc (including the balance changes list) before designing the campaign.
- Keep every deviation from real-world figures in the design doc's balance changes list.
