# vanity — testing and benchmarks

This document defines Vanity's permanent evidence policy. Product claims are accepted only when reproducible tests observe them on every relevant plane.

## 1. Evidence rule

A contract is complete only when every relevant observation plane is green.

| Plane | Typical suffix/artifact | What it proves |
| --- | --- | --- |
| Runtime | `*.test.ts` | Graph evaluation, serializers, recipes, setters, validation, snapshots, diagnostics. |
| Type | `*.test-d.ts` | Accepted/rejected shapes, inference, trait propagation, axis/mode keys, runtime honesty. |
| Editor DX | `*.dx.test.ts` | Completion, hover, rename, source locality, diagnostic count/message/range. |
| Output | `*.out.test.ts` | Exact CSS functions, selectors, layers, registrations, slots, source/debug metadata. |
| Conformance | spec/WPT-derived fixtures | Same-named CSS helper grammar and semantics. |
| Browser | Playwright | Actual cascade, inheritance, computed values, interactions, first paint, accessibility. |
| Integration | Vite/Nuxt dev and production | Virtual CSS, HMR, SSR, optimizer survival, process cleanup. |
| Packaging | packed fresh apps | Export map, declarations, peers, side effects, tarball contents, real consumer resolution. |
| Introspection | manifest/audit snapshots | Provenance, axes/cases, slots, portability, source mappings, actionable audits. |
| Performance | benchmark fixtures | Completion, diagnostics, typecheck, build, output, manifest, and runtime budgets. |
| Documentation | compiled snippets | Public examples describe the package that actually ships. |

Unit coverage cannot substitute for browser cascade behavior. Browser success cannot substitute for editor diagnostics. A green repository build cannot substitute for installing the tarball in a clean app.

### 1.1 Release gate

Every accepted change remains an independently verifiable vertical slice. The public suite, typecheck, build, demos, package rehearsal, and maintained fresh-app smoke stay green at integration boundaries.

Every required evidence plane is green before release acceptance. Slower promotion matrices run on their defined schedule and remain green.

## 2. Fixture families

Maintain one vocabulary across fixtures while varying scale.

### 2.1 Micro fixtures

One feature and one failure. Used for exact types, diagnostics, serialization, and CSS output.

### 2.2 Prism

The shared representative design system. It exercises colors, lengths, axes, recipes, anatomy, ports, mutable tokens, overrides, aliases, and manifest provenance without becoming an application demo.

### 2.3 Scale fixtures

Generated but source-controlled definitions at three sizes:

| Size | Target shape |
| --- | --- |
| Small | ~50 tokens, 2 axes, 5 recipes. |
| Medium | ~500 tokens across 10 modules, 3 axes, 30 recipes/anatomies. |
| Large | ~5,000 tokens across 50 modules, 4 axes, 150 style/recipe consumers. |

Fixture counts evolve with representative systems; benchmark identities and result storage stay stable.

### 2.4 Fresh applications

Strict Vite and Nuxt apps install the packed package with no repository aliases, workspace links, or generated artifacts copied from the monorepo.

### 2.5 Browser applications

Keep the Hail-backed Nuxt flagship and small comparison/integration fixture. Architecture completion never depends on a demo’s visual concept.

The [demo contract](./demo.md) governs the Prism studio and dispatch-card comparison. Their visual concepts are replaceable; the computed-style, accessibility, SSR, HMR, optimizer, and process assertions remain permanent gates.

## 3. Value conformance

Every same-named CSS helper receives a capability table and fixtures for:

- literals and ergonomic primitive shorthand;
- every accepted CSS channel/data-type category;
- typed token/custom-property references;
- nested calculations;
- valid raw future syntax;
- invalid/incompatible types;
- serialization form;
- build fold versus preserved CSS expression;
- feature requirement versus configured support target;
- proven fallback/enhancement or actionable `reference: 'val'` diagnostic when outside target;
- browser computed value when stable to assert;
- optimizer/toolchain survival.

Authoritative CSS specifications and relevant Web Platform Tests are the source of cases. Copy only minimal cases needed to establish the contract and record their provenance; do not create a divergent grammar by intuition.

Color coverage includes every shipped constructor, interpolation space/hue policy, relative channel form, missing component, alpha form, gamut-sensitive preservation, and native/fallback capability ceiling.

Math coverage includes additive compatibility, multiplication/division, mixed dimensions, `min`/`max`/`clamp`, precedence, and context rejection.

Mixed static/live expressions additionally prove recursive partial folding: constant subtrees collapse, the remaining `calc()` shell contains only live dependencies, and no handle can stringify to `[object Object]`.

## 4. Token and axis matrix

Test each data type against:

- zero-config raw shorthand (`reference: 'var'`, `emit: true`);
- an engine-configured shorthand policy;
- configured `reference: 'val'`;
- configured/inferred `reference: 'var'`;
- downstream shorthand derivation remains CSS-reactive, while explicit/engine-default `reference: 'val'` produces the build-folded counterpart;
- null and typed no-default token;
- known `emit: false` value;
- registration;
- element-local scheme plus typed registration rejection;
- element-local scheme plus universal-syntax registration preservation;
- explicitly root-bound scheme plus registration;
- mutable base slot;
- typed mutable no-default base reservation, both unregistered/invalid-until-set and registered with `initial-value` as its effective default;
- one complete axis;
- base plus partial axis;
- multiple independent axes in each order;
- explicit sparse case;
- mutable base/mode/case set and unset;
- explicit-target external/vanity custom-property writes on HTML, SVG, and `CSSStyleDeclaration`-like targets;
- Standard Schema transformed output plus `throw`/`fallback`/`omit`, missing app-plane registry, and async-schema rejection;
- authored/reserved branches appear in handle types while omitted partial modes and unauthored cases do not;
- mutable `null` mode/case reservation has no authored slot value, accepts `$set()`, and `$unset()` restores the prior effective expression;
- native scheme output composes a reserved branch fallback inside `light-dark()` and selector emission preserves the equivalent fallback behavior;
- module composition/derivation;
- token override class;
- resolved environment snapshot;
- manifest and DTCG projections;
- authored DTCG plugin codecs at base, axis-mode, and case addresses, including branch-only dependency order;
- resolved expression preview or explicit preview-unavailable reason in manifest/`ds.explain()`.
- `$dec` leaf/group projection across properties, aliases, custom properties, registered conditions, raw selectors, reference policies, and invalid plain namespaces.

Root/condition output matrix:

- system `:root`;
- system widget root;
- module root;
- group root if shipped;
- same-element `&[data-*]`;
- ancestor `[data-*] &`;
- descendant `& [data-*]`;
- absolute selector;
- media/supports/container wrappers;
- combinations and `@scope` when supported;
- mutable substitution-point accepted and rejected placements.

Order matrix:

- base before every axis;
- axes follow declared order, not import order;
- cases after axes;
- explicit application triggers beat preference triggers;
- native preference arms preserve consuming-element locality and nested `color-scheme` changes;
- root-anchored attribute/class arms preserve independent nested-root selection;
- media-query selector fallbacks are asserted/documented as document-global and never mislabeled element-local;
- unsupported element-local fallback either diagnoses or requires an explicit degraded/root-bound policy;
- declaration order is the default axis order;
- exhaustive `consolidate({ axisOrder })` overrides declaration order and rejects omissions/duplicates;
- override class/runtime public behavior follows declared policy;
- consumer unlayered CSS retains expected platform precedence.

## 5. TypeScript/editor DX contract

Selenita is required for the editor-DX plane. Assignability tests alone cannot prove that an API is pleasant at the cursor.

For every new public API, lock:

- completion items and their order/relevance at the authoring site;
- exactly one useful diagnostic for common mistakes;
- diagnostic range on the offending key/value;
- readable hover free of internal conditional-type walls;
- definition and references across token modules;
- rename from definition and consumer;
- unrelated graph/engine isolation;
- no `undefined` pollution in valid staged callbacks;
- engine/axis/plugin literal preservation without `as const` ceremony;
- semantically equivalent engine instances compose across HMR/package duplication while incompatible signatures fail locally;
- plane-neutral and runtime `$axes`/`$case()` paths both return branch handles, with side effects present only on mutable runtime branches;
- `transaction()` mirrors the exact runtime token/axis trees and validates every queued value/root before the first write;
- narrow runtime setters for mutable base/mode/case handles;
- standards lane availability under aliases-only policy.
- Hail option, constructor, marker, control-resolution, conditional elevation, token-preset, and rule-preset surfaces with compact named hovers and cursor-local invalid tuple/name/conflict diagnostics.

Hover fixtures evaluate the text a user actually reads. They reject leaked compiler internals, unexplained overload counts, repeated expanded shapes when a named public type can preserve the same inference, and documentation blocks too long to scan in an editor popup. When TypeScript forces a trade-off between compact presentation, inference, soundness, and compiler performance, the chosen trade-off is measured and recorded rather than accepted accidentally.

Every public callable or callable namespace used in the canonical workflow must appear in the editor-DX suite through at least one completion, hover, or cursor-local diagnostic fixture. Domain tests may share that evidence; the requirement is public-surface coverage, not one test file per export. Framework-generated imports must resolve to the exact public export type and may never degrade to `any`.

Auto-import integrations receive the same tests as explicit imports. A generated global must retain the exact `typeof import(...)` public signature; `any`, widened variant keys, or lost documentation is a release blocker.

System namespace fixtures lock the exported reserved-member set, namespaced plugin convention, constructor/plugin/system collision diagnostics, and the rule that an unreserved core top-level addition is a system-surface version change.

Type tests that merely assert assignability are insufficient for APIs whose product claim includes completion, rename, or error locality.

## 6. Performance benchmarks

Record cold and warm results with environment metadata. Benchmarks are comparative gates against the previous accepted implementation on the same machine/CI class, not universal marketing numbers.

Required measurements:

- `tsc --noEmit` cold and incremental;
- declaration emit time and `.d.ts` size;
- TypeScript `--extendedDiagnostics` instantiation count and memory for value graphs;
- completion latency at root tokens, deep groups, axes, cases, `css()` properties, and aliases;
- diagnostic latency after a one-character typo;
- rename latency across composed modules and consumers;
- Vite production build time;
- Nuxt dev cold start and CSS HMR latency;
- manifest generation time/size;
- emitted CSS size with and without mutable slots;
- runtime entrypoint and runtime metadata size;
- snapshot serialize/hydrate time.

Value-resolution changes use a dedicated propagation matrix:

- self-contained expressions only;
- one system-bound leaf in shallow, medium, and deeply nested calculations/operations;
- mixed self/system expressions across the small/medium/large fixtures;
- hover/declaration readability and union width at each scale;
- direct comparison of the candidate `Resolution` generic against a branded/erased encoding with identical call-site behavior.

Initial regression policy:

- no accepted change may degrade a large-fixture editor/type metric by more than 20% without an explicit decision explaining the user-visible gain;
- D65 applies a 1ms floor to that relative editor threshold; sub-millisecond interactions use absolute latency, repeated-run stability, and unchanged result counts because percentage deltas at timer-noise scale are not meaningful product regressions;
- completion and diagnostic interactions must remain subjectively immediate and stay within the recorded numeric baseline;
- mutable-slot overhead is reported separately for zero, typical, and all-token mutability;
- type-level bulk axis syntax ships only if it stays within the same budget as canonical per-token syntax.
- D62 selected separate self/system brands plus focused overloads: at 5,000 mixed expressions the rejected generic used 1.25s TypeScript total time and 339,107 declaration bytes versus 0.77s and 279,177 bytes for the selected encoding.

Store machine-readable results under a generated benchmark artifact path and commit a human summary only when a new baseline is accepted.

### 6.1 Resource hygiene

Resource-heavy planes use measured, bounded concurrency. Selenita language services use at most six local workers while leaving one core for the host, and two workers in CI; the compact production browser matrix uses two workers; independent demo builds use at most three. Complete SDK type/editor tests, generated benchmarks, browser matrices, and packed fresh-app lifecycles remain separate phases so their compiler, browser, and filesystem peaks do not stack. A type-level prototype is first measured on the small fixture; recursive growth or a multi-gigabyte compiler heap is a design failure to remove, not a reason to keep rerunning the large corpus. Long-lived dev/browser processes must release watchers, HTTP, and HMR ports before another lifecycle begins. The raw vanilla-extract compatibility compiler must remain lazy and transportless; its regression fixture occupies Vite's default WebSocket port while proving compilation still succeeds without a warning. Sandbox-denied browser/Mach-port or watcher failures are rerun in the supported unsandboxed environment, while assertion failures remain red.

The maintainer loop has two honest gates. `pnpm run check:fast` uses cached lint, root tooling/browser-spec typechecking, incremental SDK typechecking, and the runtime/output test plane; `pnpm run check` adds the complete workspace typecheck, documentation, all Selenita and type assertions, audits, and benchmark-fixture drift. `pnpm run validate` adds canary, optimizer, production/development browser, and lifecycle evidence. Fast feedback never substitutes for the complete release-shaped gate.

The accepted large fixture records 1.00s TypeScript total time, 287,522 instantiations, 142,142 kB reported memory, 587,110 B declarations, 5.008ms CSS completion, 0.104ms runtime completion, 6.132ms graph rename, and 6.259s production manifest/CSS build. The accepted environment, fixture identities, and complete baseline are in [benchmarks.md](./benchmarks.md).

## 7. Runtime/browser contract

Browser tests assert:

- no failed stylesheet/resource requests;
- no console/page errors;
- first styled paint remains styled under SSR;
- omitted-root document binding works only for a `:root` system; widget roots remain explicit;
- custom-property inheritance and axis selection produce real computed values;
- mutable base/mode/case writes update expected descendants;
- `$unset()` restores authored values;
- inner widget runtimes do not leak to siblings;
- shadow-root behavior matches the documented support policy;
- external custom-property writes affect SVG presentation attributes through ordinary CSS;
- `light-dark()` or selector scheme output behaves in supported browsers;
- unregistered element-local `light-dark()` tokens respond to nested `color-scheme` overrides;
- typed registered public properties never silently freeze an element-local scheme token at an ancestor;
- per-arm scheme manifest locality matches observed native, root-selector, media-fallback, and absolute-selector behavior;
- port and mutable token writes coexist;
- runtime snapshot rendered on the server hydrates without a flash;
- snapshot round trips preserve base, axis-mode, case, and runtime-managed mode addresses through individual and batch setters;
- an additive runtime schema change reconciles and hydrates still-valid entries instead of rejecting the snapshot wholesale;
- removed/type-changed/unauthored addresses are skipped with exact migration diagnostics, while unsupported protocol versions reject safely;
- accessibility/motion/focus contracts remain intact.
- Hail’s mutable controls change computed output, semantic elevation reverses across schemes, and static-only Hail emits no control properties.

Selectors are tested against actual DOM placement, not only string snapshots.

## 8. Dev/HMR/toolchain matrix

The permanent matrix preserves the lessons of the July 2026 hardening review:

- every virtual stylesheet URL requested by a browser returns 200;
- repeated reloads preserve styled first paint;
- dependency CSS HMR replaces in place;
- export-shape changes cause exactly the documented reload behavior;
- runtime overrides survive compatible HMR or receive an explicit rebind diagnostic;
- an equivalent re-evaluated engine/system retains compatibility without object-reference equality;
- a semantically changed engine or runtime schema receives a precise invalidation/migration diagnostic;
- server shutdown releases HTTP and HMR listeners;
- repeated start/stop does not leak watchers or ports;
- modern CSS emitted by values/axes survives every supported optimizer without invalid rewrites or unexplained warnings;
- source/export discovery and debug-name transforms keep adversarial AST fixtures for aliases, destructuring, re-exports, comments, and new syntax.

Supported version matrices are recorded in package metadata and CI. A valid browser value that produces warnings in a default supported stack is a red integration gate until vanity configures, preserves, or sharply documents the limitation.

## 9. Packaging/fresh-app gate

Before publication or promotion:

1. lint;
2. SDK typecheck;
3. all runtime/type/editor/output/conformance tests;
4. SDK build;
5. package dry-run and tarball inspection;
6. both demo typechecks/builds;
7. production and development Playwright matrices;
8. process lifecycle checks;
9. fresh strict testing-kit, Vite, and Nuxt tarball smoke;
10. manifest, audit, and flagship-capability walk;
11. performance comparison against the accepted baseline;
12. documentation snippet compilation.

The current workspace commands remain the starting point:

```text
pnpm run sdk:typecheck
pnpm run sdk:test
pnpm run sdk:build
pnpm run docs:examples
pnpm run bench:fixtures:check
pnpm run bench:resolution
pnpm run bench:baseline
pnpm run demo:typecheck
pnpm run demo:build
pnpm run css:optimizer:check
pnpm run demo:e2e
pnpm run fresh:smoke
pnpm run audit
pnpm run validate
```

The suite may add benchmark, conformance, and documentation commands; it must not weaken the existing gate.

### 9.1 Documentation and optimizer honesty

`pnpm run docs:examples` performs two complementary checks:

- every TypeScript fence in `docs/` is parsed as TypeScript, including deliberately partial object/array fragments used to specify one local shape;
- one complete public-package fixture per documented authoring domain is semantically typechecked against built declarations under `docs/examples/`.

A snippet presented as a standalone copyable example must be mirrored by a complete package-backed fixture; partial or intentionally rejected examples remain syntax fixtures and must be labeled by their surrounding prose. Parsing fragments as standalone programs with invented `any` declarations would make the number larger while weakening the evidence, so the gate reports both counts explicitly.

`pnpm run css:optimizer:check` inspects both production artifacts for registrations, relative color/modern color math, mutable slots, container rules, raw future rules, and framework layers. Playwright then asserts computed scheme behavior after optimization so string survival cannot conceal a semantic rewrite.

## 10. Maintained DX comparison

“Most delightful” is tested through user moments, not a permanently frozen competitor table.

Before a release, compare current official peer behavior for:

- design token definition/derivation/modules;
- rename and editor locality;
- full CSS escape/reach;
- runtime values and custom properties;
- component contracts/variants;
- framework integration;
- provenance and diagnostics;
- output scaling and ecosystem breadth.

Record only current, sourced conclusions. If a peer is better at a moment vanity claims as differentiating, improve vanity or narrow the claim. Do not keep stale marketing tables as architectural truth.

Permanent comparative questions:

- Does the quickstart compile from the packed artifact at the advertised TypeScript version?
- Can definitions and consumers rename across composed modules without touching unrelated graphs?
- Can valid modern CSS survive supported toolchains cleanly?
- Can Nuxt SSR/dev/HMR retain styled output and runtime state?
- Can a rendered declaration be traced to its authoring call, token, axis/case, and source?
- Do audits produce actionable signal rather than noise?
- Is the simpler path still simpler than assembling equivalent primitives manually?

## 11. Capability evidence

| # | Moment | Durable evidence |
| --- | --- | --- |
| 1 | Rename across modules and consumers | [`tokens.rename.test.ts`](../../sdk/src/tokens/tokens.rename.test.ts) and canonical module IntelliSense in [`tokens.graph.dx.test.ts`](../../sdk/src/tokens/tokens.graph.dx.test.ts). |
| 2 | Add a scheme axis without component edits | Axis type/output fixtures plus the computed light/dark probes in [`demos.spec.ts`](../../tests/demos.spec.ts). |
| 3 | Live-tune brand and rederive in CSS | Prism hue and comparison Vanity-lane assertions in [`demos.spec.ts`](../../tests/demos.spec.ts); no JavaScript palette mirror exists in the studio. |
| 4 | Live-tune a non-color value | Prism radius/font controls and compact density computed-style assertions in [`demos.spec.ts`](../../tests/demos.spec.ts). |
| 5 | Sparse multi-axis intersection | [`tokens.axes.out.test.ts`](../../sdk/src/tokens/tokens.axes.out.test.ts) and Prism's scheme + density shadow explanation. |
| 6 | Override a published component contract | [`port.out.test.ts`](../../sdk/src/ports/port.out.test.ts) and the port-driven Prism progress component. |
| 7 | Style typed headless states | [`css.dx.test.ts`](../../sdk/src/css/css.dx.test.ts), recipe/anatomy fixtures, and keyboard-tested Prism tabs/dialog. |
| 8 | Bind reactive state through a typed port | [`port.test-d.ts`](../../sdk/src/ports/port.test-d.ts), `usePorts` fixtures, and both live Prism progress bars. |
| 9 | Use CSS vanity does not yet model | [`css.out.test.ts`](../../sdk/src/css/css.out.test.ts), Prism's scoped `@starting-style`, and the optimizer-survival gate. |
| 10 | Trace a rendered declaration | [`introspect.test.ts`](../../sdk/src/introspect/introspect.test.ts) and Prism's build-produced `ds.explain()` provenance cards. |
| 11 | Export standard and authored DTCG | [`dtcg.test.ts`](../../sdk/src/introspect/dtcg.test.ts), including resolved projection and portable authored round trips. |
| 12 | Extend values through public plugins | [`openSystem.test.ts`](../../sdk/src/system/openSystem.test.ts), property-alias fixtures, and [`hail.test.ts`](../../sdk/src/presets/hail/hail.test.ts) cover constructors, low-level operations, callable configuration, ownership, and Hail dogfood. |
| 13 | SSR persisted runtime state without flash | Prism response-HTML/first-paint/reload assertions in [`demos.spec.ts`](../../tests/demos.spec.ts) and snapshot reconciliation fixtures. |
| 14 | Install the tarball in strict testing-kit, Vite, and Nuxt consumers | [`fresh-smoke.ts`](../../scripts/fresh-smoke.ts), which packs and installs without workspace aliases before testing-kit type/runtime/DX and app type/build/lifecycle checks. |
| 15 | Let an agent self-correct | [`introspect.dx.test.ts`](../../sdk/src/introspect/introspect.dx.test.ts), [`audit.test.ts`](../../sdk/src/introspect/audit.test.ts), and generated agent context from the same manifest records. |
| 16 | Install Hail without hidden cost | Hail runtime/type/Selenita suites, the packed `/presets` consumer, and Hail-backed flagship prove static zero-output through mutable scheme-live use. |

No gate becomes green from a manual glance alone. Exploratory manual testing is valuable input, not durable proof.
