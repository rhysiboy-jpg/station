# Orbitwright

A browser game about designing a space station, where the layout is the puzzle. See [README.md](README.md) for commands and layout, and [docs/design.md](docs/design.md) for the game.

## Adding content

New modules, equipment, resources and challenges follow [docs/content-rules.md](docs/content-rules.md). The mechanical rules are enforced by `src/sim/content.test.ts`; if a new part needs to break one, change the rule in the doc first.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for rhysiboy-jpg/station. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
