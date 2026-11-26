# Air is held per module and mixed by fans, unlike the other networks

[ADR 0003](0003-shared-networks-not-routed-conduits.md) makes each **Resource** a shared pool across its **Network**. Air is the exception: each **Pressurised** module keeps its own O2 and CO2, crew breathe from the module they are in, the oxygen generator / CO2 scrubber works on its own module's air, and fans swap a fixed volume across each joint between pressurised modules every tick (about 0.07 m³/s, roughly an ISS intermodule fan). We chose this so placement inside the pressurised part of the station matters: a crowded habitat several modules from the scrubber has worse air than one next to it. Water stays pooled per network, because water moves through pipes and tanks rather than open hatches.

## Consequences

- Air readings and future air **Warnings** are per module, not per network.
- Connection bottlenecks (#9) can later scale the fan exchange per joint rather than cap a pooled flow.
