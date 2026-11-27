# Orbitwright

A browser game about designing a space station, where the layout of connected components is the puzzle. Working title; the repository is `station`.

**Play:** https://rhysiboy-jpg.github.io/station/

- [Game design](docs/design.md)
- [Glossary](GLOSSARY.md)
- [Prototype spec](docs/specs/prototype-sandbox.md)
- [Playtest checklist](docs/playtest.md)
- [Decision records](docs/adr/)

## Development

Needs Node 22.

```sh
npm install
npm run dev        # dev server at http://localhost:5173
npm test           # run the tests once
npm run test:watch # re-run tests on change
npm run typecheck  # type-check the core (no browser APIs) and the app
npm run build      # static build into dist/
npm run e2e        # browser smoke tests with Playwright (builds first)
```

## Layout

- `src/sim/`: the simulation core. Plain TypeScript with no rendering or browser dependencies ([ADR 0001](docs/adr/0001-typescript-sim-core-separate-from-rendering.md)). Its public interface is `src/sim/index.ts`; the view imports only from there. This is enforced twice: `tsconfig.sim.json` type-checks the core without DOM types, and `src/sim/boundary.test.ts` fails if the core imports any package.
- `src/sim/content.ts`: module types as data, so balancing is editing numbers.
- `src/view/`: the PixiJS 2D view. It reads simulation state and draws it.
- `src/ui/`: HTML panels (status, alerts, inspector, challenge) and browser saves (autosave, export, import).
- `e2e/`: browser smoke tests (Playwright), run in CI after the unit tests.
- `src/main.ts`: owns the current station and what the player is doing (tool, selection, camera, speed, overlay), draws each frame and runs the fixed-tick loop. Panels, banners, keyboard shortcuts and saves live in `src/ui/`.

Pushes to `main` deploy to GitHub Pages through `.github/workflows/pages.yml`. CI runs on every pull request.
