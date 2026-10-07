# Agent-skill checks

Two checks for the skills in [`sdk/skills/`](../../sdk/skills/):

- `snippets.ts` and `snippets/` — the **snippet gate**. `pnpm run skills:verify` copies every mapped code block from the skills verbatim into a copy of `fixture/` (with the richer design system in `snippets/`), then typechecks and builds it, executes the system examples, and runs the test examples with Vitest. Blocks it can't host are listed in `skippedSkillSnippets` with the reason. It needs no agent.
- `evals.json` — **agent evaluations**: designer-style tasks plus source-level assertions. `pnpm run skills:eval prepare <run-dir> <model>` gives each task its own fixture copy and a `prompt.md`; `pnpm run skills:eval grade <run-dir>` grades what the agents produced.

`fixture/` is the Nuxt 4 + Vue + Pug app both start from: a small role-named system, an authoring barrel, base rules, and one card component. Dependencies are linked from `sandbox/demo-main`. When to run each check is in the [workspace manual](../../docs/maintainers/workspace.md#9-agent-skills).
