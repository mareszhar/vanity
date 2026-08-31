# vanity — vision

> **Vanity is a design-system engine and TypeScript harness for CSS.** It gives authors a coherent, typed, composable, inspectable way to describe design systems and styling while preserving the capability and semantics of the platform.

The guiding question is:

> What would be the most delightful way to style with TypeScript?

Vanity aims to make styling with TypeScript feel unusually direct, capable, and enjoyable.

Its design-system language uses TypeScript and CSS for what they are strongest, and a compiler to connect them without a runtime styling engine.

## 1. The promise

When Vanity exposes a CSS concept, it must:

1. use CSS's name and semantics exactly;
2. accept the platform grammar within a versioned maturity target;
3. accept compatible token handles wherever the underlying value is accepted;
4. accept CSS-wide keywords in every declaration position;
5. preserve valid future syntax through a typed form or raw standards escape hatch;
6. emit ordinary, inspectable CSS;
7. add useful inference, validation, provenance, and diagnostics;
8. state every fallback or degradation honestly.

When Vanity exposes a concept CSS does not name—token, axis, recipe, anatomy, port, runtime snapshot—it coins a distinct word and makes its ownership explicit.

## 2. One system, two states

Vanity itself is the engine. The user creates one design system and grows it immutably:

```TS
import { createSystem, thisMode } from '@mszr/vanity'

const open = createSystem()
  .addAxis('density', ['compact', 'cozy'])
  .addAxis('scheme', {
    modes: {
      light: '&',
      dark: thisMode,
    },
  })

export const ds = open
  .addTokens(ds => ({
    color: {
      brand: ds.oklch(0.6, 0.15, 264),
    },
  }))
  .consolidate({
    prefix: 'app',
    root: '#app',
  })
```

The open system describes and accumulates capabilities. `consolidate()` returns a new locked system that styles, emits through the compiler, binds runtime behavior, and explains itself. Registration is immutable; one open system can produce many locked forks safely.

The sentence to remember is:

> **Grow a system additively; consolidate it; style with it.**

## 3. Compose, resolve, project

Vanity succeeds when semantic facts are authored once, resolved once, then projected without mirrored registries or copied string paths:

```text
descriptions + contributions
            │ compose immutably
            ▼
        open system ──may fork──┐
            │ consolidate       │
            ▼                   ▼
        locked system      another locked fork
     + in-process contract
       ┌──────┼────────┐
       ▼      ▼        ▼
      CSS   runtime  observation/interchange
            contract manifest · explain · audit · DTCG
```

CSS, runtime data, manifests, explanations, and interchange are sibling projections. They are not later steps in one continuum.

One semantic subject may have several contextual interfaces:

```text
token definition
  → logical token handle
  → resolved token handle
      ├─ build-time styling use
      ├─ restored application/SSR handle
      └─ mutable token control in a runtime controller
```

The subject retains semantic identity. The JavaScript handle does not travel between environments or acquire methods in place.

## 4. Execution, representation, and ownership

Vanity keeps independent questions independent:

| Question | Answers |
| --- | --- |
| When does code execute? | authoring time, build time, runtime |
| Where does it execute? | Node/build worker, SSR server, browser |
| What representation is present? | in-process contract, portable contract, generated module, CSS, manifest |
| Who owns the work? | engine, system, compiler, build host, runtime controller, browser |

```text
host adapter ──mounts compiler into──> build host
compiler ──materializes──> CSS/data artifacts
runtime controller ──writes declared inputs──> roots
browser ──evaluates──> cascade and inheritance
```

The compiler owns materialization. `consolidate()` performs no I/O, requires no style-module scope, creates no global registration, and can be imported by tools. The browser owns live CSS behavior; the runtime controller only writes deliberately declared slots and mode controls.

## 5. Core principles

These principles are the product hierarchy for Vanity. They apply to public API design, compiler architecture, documentation, diagnostics, testing, and maintenance. When principles pull against one another, the earlier principle wins and the trade-off is recorded in [decisions](./maintainers/decisions.md).

1. **Delight governs.** Design for the person authoring, reading, debugging, reviewing, and extending a system. The happy path should read like the idea it expresses, common mistakes should be locally recoverable, and advanced power should remain discoverable. Implementation convenience and internal elegance are not evidence of a delightful product.
2. **Harness all of CSS.** CSS is the capability floor and semantic authority. CSS concepts retain the platform's names, grammar, composition rules, and behavior; Vanity adds inference, structure, and leverage rather than inventing a smaller substitute language. Any typed subset keeps an honest standards/raw route to valid platform syntax.
3. **Names transfer useful inference.** A base term preserves the same prediction everywhere it appears; qualifiers may specialize it by domain, owner, state, representation, or relation. A behavior is defined once, then projected into authoring, compiler, runtime, introspection, and documentation surfaces. Mirrored registries and independently evolving serializers are design debt.
4. **The system grows additively.** Ordinary composition adds capability; duplicate registration and silent redefinition do not exist. Augmentation and overwrite, when explicitly requested, have distinct names, type rules, diagnostics, and provenance. One open system can produce independent locked forks without global state or order-dependent mutation.
5. **Separate independent concerns.** Data type, expression, reference, representation, execution environment, emission, variation, mutability, and runtime activation are composable dimensions. A value does not become mutable merely because it is emitted as a custom property; an axis does not gain color semantics because it is named `scheme`; portable data does not become browser code because an application system projection can be restored from it.
6. **Boilerplate is active harm.** Inference and composition should remove repeated declarations, copied string paths, mirrored token registries, manual `var()` construction, framework glue, and hand-kept metadata. A requirement to repeat information Vanity already knows is a product defect, not harmless ceremony.
7. **Errors arrive at the cursor or build.** TypeScript owns names, relationships, subject-specific states, and structural validity. Real CSS parsers own value grammar and selector syntax. Runtime validation is reserved for genuinely dynamic inputs, and every failure is structured, source-local, actionable, and free of leaked substrate jargon.
8. **The browser is the runtime.** Cascade, inheritance, custom properties, media and container queries, layers, scopes, relative colors, and native functions perform live styling work. Runtime code writes declared slots, activates precompiled choices, and hydrates state; it does not reconstruct the design graph or become a hidden CSS-in-JS engine.
9. **Boring CSS is the durable contract.** Output stays ordinary, inspectable, portable, optimizable, overrideable, and useful if Vanity disappears. Selectors, at-rules, layers, and custom properties remain recognizable in browser tools. Extraction and projection must not make the cascade mysterious.
10. **Predictability beats magic.** Root ownership, composition order, axis precedence, condition expansion, folding, fallback selection, runtime targets, identities, and escape hatches are explicit and introspectable. Convenience may bundle policy, but it is opted into visibly and lowers through the same primitives available to users.
11. **Power is opt-in; escape hatches degrade gracefully.** Raw CSS values stay light. Registration, mutability, activation, strict aliases, interchange, advanced algorithms, and policy plugins are deliberate choices. Leaving a typed form for a raw or experimental escape hatch may reduce guarantees, but it must not sever emission, provenance, or the rest of the system.
12. **Capabilities and policies differ.** Core exposes what the platform and system can do; a project or plugin may enforce a narrower preferred vocabulary. Presets, aliases, conventions, and design opinions compose on top without shrinking the underlying standards escape hatch or pretending to be CSS semantics.
13. **Extensions are first-class.** Users can create values, constructors, operations, conditions, diagnostics, token projections, and tooling through public, versioned contracts without subclassing private implementation types or receiving privileged hooks unavailable to other extensions. Built-ins should dogfood those same seams.
14. **Diagnostics, editor experience, and provenance are product surfaces.** Hover text, completion order, TSDoc, rename, structured errors, related locations, fix guidance, explanation trails, manifests, and agent queries are part of the API—not polish to add after runtime behavior works. A warning without trustworthy locality and a handle without an explanation path are unfinished.
15. **Frameworks are clients.** Vue, Nuxt, Vite, SSR systems, and future adapters receive excellent integration while the core value, token, condition, and rule languages remain framework-independent. Adapters project shared contracts; they do not become the authority for them.
16. **Performance is developer experience.** Type instantiation cost, completion latency, incremental compilation, HMR recovery, CSS delivery, artifact size, and runtime work all have budgets. A feature that is elegant in a tiny fixture but collapses at realistic scale is not complete.
17. **Evidence outranks completion claims.** Runtime behavior, types, editor behavior, emitted CSS, browser cascade, integration, packaging, introspection, documentation, and performance are separate proof dimensions. Status prose and green unit tests cannot substitute for the dimension a claim actually concerns.
18. **The implementation must be as legible as the API.** Keep execution, environment, representation, ownership, and materialization boundaries explicit; keep public primitives small and artifacts deterministic. Internal cleverness is justified only when its invariant can be stated, inspected, and defended by tests.

## 6. The capability boundary

In scope:

- typed CSS values, functions, operations, and raw standards forms;
- additive design-system construction, token modules, axes, conditions, roots, layers, and plugins;
- build-time classes, rules, fragments, recipes, anatomy, atoms, ports, at-rules, and raw CSS;
- runtime mutation of declared tokens and mode controls;
- snapshots, SSR/hydration, HMR, manifests, audits, DTCG, CLI inspection, and framework adapters;
- consumer testing tools for emitted CSS, folding, rendering, and editor DX.

Opt-in or adapter territory:

- property aliases and authoring policy;
- Hail’s normalized color ranges, semantic elevation, BEM sizing, layout mixins, starter tokens, and selectable rule presets;
- DTCG and external content projections;
- a future emission-transform hook when a real consumer requires it;
- a future explicit runtime stylesheet capability.

Out of scope:

- a runtime CSS-in-JS engine;
- a component library;
- implicit stylesheet patching;
- reconstructing arbitrary TypeScript from interchange data;
- a built-in SVG/Iconify product API;
- whole-system composition before its compatibility problem and consumer are proven;
- forcing a framework, preset, alias vocabulary, design-tool format, or release-time compatibility layer.

## 7. Success

Vanity ensures a serious design system can:

- express the CSS it needs without capability cliffs;
- discover its token, condition, axis, component, and runtime contracts at the cursor;
- evolve through additive composition with loud, local conflicts;
- render and code-split ordinary CSS without a client styling engine;
- tune declared runtime decisions without recomputing design logic in JavaScript;
- explain any public handle and emit a stable project manifest;
- survive Nuxt/Vite SSR, HMR, package boundaries, duplicate installs, and realistic scale;
- teach both a human and an agent how to make a safe change.
