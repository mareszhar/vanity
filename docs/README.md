# vanity documentation

Vanity’s documentation has one public product path and one maintainer path. Start with the guide; use reference contracts for exact behavior; use maintainer records when changing Vanity itself.

## Start here

- [Getting started](./guides/getting-started.md) — install Vanity, create a system, compile styles, and choose the next document.
- [Vision](./vision.md) — product promise, capability boundary, and the principles that govern every surface.
- [Language](./language.md) — canonical vocabulary, API names, file roles, and authoring style.

## Reference

The reference defines Vanity’s public contracts.

- [Typed CSS values](./reference/spec-values.md)
- [System authoring](./reference/spec-system-authoring.md)
- [Open and locked systems](./reference/spec-system.md)
- [Tokens](./reference/spec-tokens.md)
- [Conditions, roots, and axes](./reference/spec-conditions.md)
- [Styling and output](./reference/spec-css.md)
- [Recipes and anatomy](./reference/spec-recipes.md), [ports](./reference/spec-ports.md), and [integrations](./reference/spec-integrations.md)
- [Plugins, constructors, and policy](./reference/spec-extensions.md)
- [Runtime](./reference/spec-runtime.md)
- [Introspection and diagnostics](./reference/spec-introspection.md)
- [Vue and Nuxt](./reference/spec-vue.md)
- [Consumer testing kit](./reference/testing-kit.md)
- [Hail](./reference/spec-hail.md) — the optional, deletable opinionated layer

## Maintainers

These records govern implementation, evidence, and the repository rather than consumer setup.

- [Architecture](./maintainers/architecture.md)
- [Design principles](./principles.md)
- [Patterns](./maintainers/patterns.md) and [authoring vocabulary](./maintainers/authoring-vocabulary.md)
- [Decisions](./maintainers/decisions.md)
- [Capability-preservation matrix](./maintainers/capability-matrix.md) and [CSS parity ledger](./maintainers/parity-ledger.md)
- [Testing and evidence](./maintainers/testing.md), [benchmarks](./maintainers/benchmarks.md), and [demos](./maintainers/demo.md)
- [Workspace manual](./maintainers/workspace.md)

## Contract status

| Status | Meaning |
| --- | --- |
| `target` | Settled behavior accepted for a future slice. |
| `proven` | The underlying pattern has isolated executable spike evidence. It is not necessarily integrated. |
| `implemented` | Present in product code with the required evidence green. |
| `deferred` | Deliberately excluded until its recorded re-entry trigger. |
| `dropped` | Intentionally removed, with a reason recorded. |

Specifications are contract-driven: they state the behavior and why it matters before proposing an implementation. Update the owning contract, decision record, capability/parity ledger, examples, and evidence with any public behavior change.
