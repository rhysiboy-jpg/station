# Orbitwright

A browser game about designing a space station, where the layout of connected components is the puzzle. Working title; the repository is `station`.

**Play:** https://rhysiboy-jpg.github.io/station/

- [Game design](docs/design.md)
- [Glossary](GLOSSARY.md)
- [Prototype spec](docs/specs/prototype-sandbox.md)
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
```

## Layout

- `src/sim/`: the simulation core. Plain TypeScript with no rendering or browser dependencies ([ADR 0001](docs/adr/0001-typescript-sim-core-separate-from-rendering.md)). Its public interface is `src/sim/index.ts`; the view imports only from there. This is enforced twice: `tsconfig.sim.json` type-checks the core without DOM types, and `src/sim/boundary.test.ts` fails if the core imports any package.
- `src/sim/content.ts`: module types as data, so balancing is editing numbers.
- `src/view/`: the PixiJS 2D view. It reads simulation state and draws it.
- `src/main.ts`: wires the two together.

Pushes to `main` deploy to GitHub Pages through `.github/workflows/pages.yml`. CI runs on every pull request.
