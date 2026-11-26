# Station

A browser game about designing and running a space station, where the layout of connected components is the core puzzle.

## Language

### Building

**Station**:
Everything the player has built: a set of **Modules** joined at **Ports**, with their **Equipment**.
_Avoid_: Base, colony, ship

**Module**:
A fixed-size rectangular hull piece placed on the grid, such as a habitat, lab or **Truss** segment.
_Avoid_: Room, building, block, part

**Port**:
A fixed point on a **Module**'s edge where it can join another **Module**'s **Port**.
_Avoid_: Docking point, socket, connector

**Connection**:
Two aligned **Ports** joined together. Each has a capacity limit per **Network**.
_Avoid_: Link, joint, edge

**Pressurised**:
A **Module** that holds air and crew. Only pressurised modules join the air **Network**.
_Avoid_: Sealed, habitable

**Truss**:
An unpressurised **Module** that carries power, heat and data and has many **Hardpoints**.
_Avoid_: Frame, scaffold, girder

**Equipment**:
A component fitted into a **Slot** or onto a **Hardpoint**, such as a battery, radiator or lab rack.
_Avoid_: Item, device, part, component

**Slot**:
An internal place inside a **Module** that holds one piece of internal **Equipment**.
_Avoid_: Bay, socket

**Hardpoint**:
An external place on a **Module**'s face that holds one piece of external **Equipment**, such as a solar panel. It is **Blocked** when another **Module** is attached on that face.
_Avoid_: Mount, external slot

**Blocked**:
The state of a **Hardpoint** covered by an attached **Module**, making it unusable.

### Simulation

**Resource**:
Something that is produced, stored and consumed: power, heat, air, water and data in the prototype.
_Avoid_: Material, commodity

**Network**:
The set of **Modules** sharing one **Resource** through their **Connections**. A **Station** has one network per resource per connected group.
_Avoid_: Grid, loop, circuit (except in player-facing text where "power grid" reads naturally)

**Tick**:
One fixed, deterministic step of the simulation. Speed controls change how many ticks run per second.
_Avoid_: Frame, turn, update

**Orbit**:
One full trip around Earth, split into **Day** and **Eclipse**. Also the unit challenges are measured in.

**Eclipse**:
The part of an **Orbit** spent in Earth's shadow, when solar panels make no power.
_Avoid_: Night (fine in UI text), dark side

**Downlink**:
Sending stored data to Earth through an antenna.

**Shed**:
Switched off to save power. In a shortage, **Equipment** is shed by priority tier, lowest first, and restarts once there is enough power again.
_Avoid_: Brownout, load-dump

**Headcount**:
The number of crew assigned to a **Module**. Crew are abstract in the prototype.
_Avoid_: Population, staff

### Failure

**Warning**:
A **Module** crossing a threshold (temperature, air, power), shown as yellow then red.
_Avoid_: Alert (the alerts list shows warnings)

**Offline**:
A **Module** that has failed past red: it stops working and its crew move to an attached **Pressurised** module until conditions recover.
_Avoid_: Broken, destroyed, dead

**Difficulty**:
A station setting. On Standard an **Offline** module still carries resources through to the modules beyond it; on Hard it cuts every **Network** it sits on.
_Avoid_: Mode (the **Sandbox** and **Campaign** are modes)

**Abandoned**:
The whole **Station** evacuated, which is the only game over.

### Game structure

**Sandbox**:
A free-building mode with no economy pressure. The prototype is a sandbox.

**Campaign**:
The long mode that grows one **Station** from a seed **Module** in a chosen starting **Orbit** type.

**Challenge**:
A goal set in the **Sandbox**, such as "keep 6 crew alive and 2 labs running through 10 orbits".
_Avoid_: Mission, objective, quest

**Contract**:
A campaign job that asks for specific capabilities and pays money and tech unlocks.
_Avoid_: Mission, order, job

**Launch**:
Delivery of **Modules** and **Equipment** from Earth, limited by cost, cargo and launch windows.
_Avoid_: Resupply (for parts), shipment
