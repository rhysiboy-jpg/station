# TypeScript, with the simulation core separate from rendering

The game is TypeScript in the browser. The simulation is a plain TypeScript core with no rendering or DOM dependencies, fully tested on its own; the 2D view (PixiJS) only reads simulation state and sends commands to it. We chose this over Godot because it is the easiest setup to build test-first and to work on in this repo, and because 3D may come later: with the core separate, a Three.js view is a rendering swap rather than a rewrite.
