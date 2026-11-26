# Claude Code skills

Project skills for Claude Code. Any Claude Code session opened in this repo picks them up automatically.

## Source

Every skill here is copied unmodified (apart from dropping the Codex-only `agents/openai.yaml` files) from Matt Pocock's [mattpocock/skills](https://github.com/mattpocock/skills) at commit [`6f7f783`](https://github.com/mattpocock/skills/tree/6f7f7831a625f040a8e06a0e7954826b87ce775a), under the MIT licence in [LICENSE-mattpocock-skills](./LICENSE-mattpocock-skills). The `pr` skill also carries its own upstream credit in [pr/CREDITS.md](./pr/CREDITS.md).

To update, re-copy the folders from a newer commit of that repo and bump the commit above.

## First run

Run `/setup-matt-pocock-skills` once. It asks where issues live (GitHub issues or local markdown under `.scratch/`) and writes `docs/agents/*.md` plus an `## Agent skills` block in `CLAUDE.md`, which the other skills read.

## What's here

You type these (`/name`):

| Skill | Use it to |
| --- | --- |
| `grill-me` | Get interviewed about a plan or design until every decision is settled |
| `grill-with-docs` | Same, while building `GLOSSARY.md` (station, module, resource, etc.) and ADRs |
| `to-spec` | Turn the current conversation into a spec on the issue tracker |
| `to-tickets` | Break a spec into vertical-slice tickets with blocking edges |
| `implement` | Build a spec or ticket test-first, then review it |
| `improve-codebase-architecture` | Survey the code for shallow modules worth deepening |
| `setup-matt-pocock-skills` | One-time repo setup (see above) |
| `handoff` | Compact a session into a doc for the next session |
| `wait-what` | Ask Claude to re-explain its last message plainly |

Claude reaches for these on its own when they fit (you can also type them):

| Skill | Covers |
| --- | --- |
| `grilling` | The interview loop behind the grill skills |
| `domain-modeling` | Keeping `GLOSSARY.md` and `docs/adr/` current |
| `tdd` | Red-green loop, good vs bad tests, where tests go |
| `codebase-design` | Deep modules, seams and interfaces |
| `diagnosing-bugs` | Feedback-loop-first debugging |
| `prototype` | Throwaway prototypes, e.g. a one-file HTML demo of a resource or power model |
| `code-review` | Two-axis review (coding standards and spec) of a branch |
| `pr` | The shape of a pull request description |

`code-review` and `prototype` share names with Claude Code built-ins. If the built-in runs instead of the version here, rename the folder and the `name:` line (for example to `mp-code-review`).

## Left out

From upstream: `triage`, `wayfinder`, `implement-spec`, `research`, `retro`, `wizard`, `ask-matt`, `teach`, `to-questionnaire`, `writing-for-agents`, and everything under `misc/` and `in-progress/`. They are aimed at larger teams, multi-agent orchestration, or non-code work. Copy any of them in later if they become useful.
