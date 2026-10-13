# vanity — spec: introspection, diagnostics, and agent surfaces

Introspection is a primary product surface. A human, editor, CI job, or agent can ask the system what exists, why it exists, where it came from, and what a change affects without evaluating style modules or reconstructing CSS.

## 1. One semantic record

System construction records authored facts once. These projections read that record:

- `ds.introspect()`;
- `ds.explain(handle)`;
- the project manifest;
- runtime inspection;
- audits;
- DevTools;
- DTCG;
- the CLI;
- source/debug names;
- bounded agent context.

Parallel provenance registries are prohibited. The portable `vanity.system/2` compiler artifact remains a private interchange form because it carries restoration data; tools see the normalized semantic map instead.

Resolved standard DTCG color values use the color space named by their emitted CSS, including full component precision. Parsed names and hex leaves use `srgb`; authored notation that a fold preserves (such as HSL alpha or a same-space adjustment) keeps that space; canonical computed `oklch()` values use `oklch`. This keeps interchange aligned with authored CSS and the explanation projection instead of normalizing every color to one space.

Standard DTCG export carries authored color leaves and exact folded values whose emitted CSS has a standard DTCG color representation. A live CSS expression, such as a non-`oklab` `color-mix()`, is not a standard DTCG value; strict export (the default) reports `VANITY_DTCG_UNSUPPORTED`. Use `{ strict: false }` for an explicit lossy snapshot or install a DTCG codec for an extension value.

## 2. Contract introspection

```TS
const map = ds.introspect()
```

The result is immutable, deterministic `vanity.introspection/2` data. Its top-level `version` is `2`, and it carries the independent compatibility, CSS, runtime-schema, and documentation identities.

The map contains:

- tokens with stable semantic paths and the full authored/emitted record;
- environmental axes and their modes, triggers, priority, locality, runtime controls, native policy, declared `covers`/`shared` paths, and description;
- conditions with their readable form, exact lowered arms, and immutable AST;
- declared roots and ownership;
- ordered cascade layers;
- installed plugins and all value extensions;
- constants;
- system policies and support target;
- built-in, plugin, and user-defined constructors;
- registered utility paths;
- the portable runtime schema;
- ordered overwrite and augmentation history;
- consolidation-time audit policy.

Every semantic entry has an `id`, `kind`, and `owner`. `declaredAt` is included when the compiler owns an exact source location. Plugin contributions retain their plugin owner rather than being flattened into anonymous system members. Module-root tokens retain their module owner. Source IDs are slash-normalized and package/project relative in emitted artifacts.

Token records preserve:

- type, `reference`, `emit`, `mutable`, and default/reservation state;
- authored expression and inference reasons; token aliases use a `var` expression with the dependency’s data type, including `unknown` when that type is not established;
- fold status and refusal reason;
- multi-axis fold coverage and any required intersection cases;
- semantic dependencies and support requirements/fallbacks;
- exact declarations, selectors, at-rules, layers, branches, and cases;
- custom-property registration;
- runtime semantic addresses and opaque slots;
- interchange portability and extension identity;
- deterministic preview and its selected environment;
- metadata, description, deprecation, and source.

The semantic map is query data. Calling `introspect()` does not emit CSS.

## 3. Two truthful scopes

`ds.introspect()` knows the consolidated system synchronously. It cannot know style modules the compiler has not evaluated. `ds.audit(config?)` follows the same boundary: it reports only findings that can be decided from the semantic map already held by the locked system.

Manifest v5 therefore has two scopes:

```text
system     exact ds.introspect() projection
modules    classes, recipes, anatomy, ports, escapes, contrast, token usage
```

No global registry pretends the locked system knows future style output.

The locked-system audit evaluates exactly these eight system-scope categories:

- `ambiguousAxes`;
- `mutableRootHazards`;
- `overwriteInventory`;
- `nonportableValues`;
- `specificityContexts`;
- `staleDerivations`;
- `derivedCaseGrowth`; and
- `descendantConditions`.

It returns a `VanityAuditReport` with `findings` and an explicit `unevaluated` list. The latter is deliberately not an empty-success signal: it names the thirteen categories that require information outside a locked system and the missing evidence kind:

| Categories | Required evidence |
| --- | --- |
| `unusedTokens`, `contrast`, `escapes`, `aliasEscapes`, `rawAssertions` | `moduleUsage` |
| `nearDuplicates`, `scaleStrays`, `focusVisibility` | `emittedCss` |
| `eagerStyleBarrels`, `cssParityGaps`, `staleArtifacts`, `rootModeDisagreements`, `unanchoredSelectors` | `buildEvidence` |

`staleDerivations` is an error by default because a missing declaration can leave an emitted build-folded value stale under an active axis mode. The other system categories remain advisory by default, and every category can be promoted or silenced through audit policy.

`derivedCaseGrowth` warns when one correct folded token needs more intersection declarations than its budget; keeping the derivation live with `reference: 'var'` is the escape. Its default advisory budget is 32 required cases.

`descendantConditions` warns with `VANITY_CONDITION_DESCENDANT` when a registered bare data/ARIA selector matches descendants rather than the styled element. Its repair is `.self`; intentional descendant matching can silence the category with `off`. Findings may carry a stable `code` alongside their category and repair.

`unanchoredSelectors` warns with `VANITY_SELECTOR_UNANCHORED` for raw pseudo keys such as `'::before'` and `':hover'` that match descendants. It names `'&::before'` or `'&:hover'` as the repair, defaults to `warn`, and honors `off` and `error`. Authored module capture supplies `selectorWarnings` to the build audit; a locked system cannot decide this category. `vanity check` supplies this evidence when all module bodies complete, and presents each compiler warning once in human output.

The complete build-scope `audit(manifest, css, config?, evidence?)` evaluates the same eight system categories alongside the thirteen evidence-dependent categories. Consolidation-time `audit` policy establishes the default level for each category; a call-time config can override it for that audit call.

## 4. Structured explanation

```TS
const token = ds.explain(ds.t.color.brand)
const condition = ds.explain(ds.conditions.wide)
const axis = ds.explain(ds.axes.scheme)
const component = ds.explain(button)
const input = ds.explain(button.ports.tint)
```

Tokens, axes, conditions, recipes, anatomies, and ports return structured semantic data.

| Subject | Explanation includes |
| --- | --- |
| token | authored expression, reference/fold decisions, dependencies, support, preview, declarations, runtime addresses, portability, and ownership; a representative `legibleOn()` approximation records its approximation in the expression and fold reason |
| recipe or anatomy | variants, toggles, defaults, parts, and published ports |
| port | type, default, validation, description, and deprecation |

`formatExplanation()` renders stable human output. Formatted prose is a view of the structured result, never the API of record. A semantic path such as `color.brand` can be resolved by the CLI without loading TypeScript.

## 5. Manifest v5

On each successful build/update the compiler writes `.vanity/manifest.json`, serves the same snapshot at `/__vanity/manifest.json`, and renders its DevTools view at `/__vanity/`.

The manifest contract is:

```TS
interface VanityManifest {
  $schema: 'https://schemas.mszr.dev/vanity/manifest-5.schema.json'
  format: 'vanity.manifest/5'
  version: 5
  system: VanitySystemMap
  systems: Readonly<Record<string, VanitySystemMap>>
  modules: Readonly<Record<string, VanityManifestModule>>
}
```

`system` is deeply and byte-order equal to `ds.introspect()`. `systems` contains additional compatibility-distinct systems only; the primary is not duplicated. Modules group source-local recipes/anatomies, ports, styles, escapes, and contrast. The `$project` module owns aggregate token-use counts because concatenated CSS cannot truthfully assign those counts to one source file.

Each style records its emitted declarations in CSS order. A declaration has a stable `id`, property, serialized CSS value, authored condition path (`[]` for base), emitted selector arm (including its CSSOM ordinal) and layer, referenced token paths, and the classifier's components. Each component retains its own origin, data type and evidence; a border can contain both token and literal components. Selectors retain the emitted spelling. When CSSOM normalizes separate selectors to the same text, `arm.ordinal` identifies their order among matching rules in the same layer and grouping context. Style token reach is the union of emitted components, excluding overwritten values and quoted `var()` text. Custom-property components retain their origins while grammar evidence stays unresolved.

Overwritten contributions remain available to compiler findings but are not preview targets.

The compiler records value spans in original UTF-16 source coordinates with the exact text and file. `editable` is true only for supported static forms with an independently authored span. Helper-created, spread-inherited, fallback-array and dynamic values carry `editable: false` and a reason. Atom property classes and layered class calls have no independent value span. Static member references rooted outside the supported `ds`/`t` forms and standalone token bindings remain uneditable even when their exact spans are recorded. Recipe and anatomy records include the class tables used by their runtime handles: bases, variant arms, toggles, compound selections, defaults and folded arms.

The strict reader and manifest diff accept only the current format. An older artifact receives `VANITY_MANIFEST_INVALID` with a regenerate instruction; manifests are regenerated rather than migrated.

The published schema ships as `@mszr/vanity/manifest.schema.json`. Objects use sorted keys, unordered record arrays use semantic-ID order, and semantic arrays such as layer/axis/overwrite order retain authored meaning. Documentation-only edits change the docs identity and manifest while leaving the CSS identity and CSS artifact stable.

The schema is closed to the recursively recognized Manifest v5 records and required fields. The published-schema test checks representative missing-field and unknown-field cases against both the schema and the strict Manifest reader.

For offline editor validation, associate `.vanity/manifest.json` with the schema shipped by the installed package:

```json
{
  "json.schemas": [
    {
      "fileMatch": ["**/.vanity/manifest.json"],
      "url": "./node_modules/@mszr/vanity/manifest.schema.json"
    }
  ]
}
```

This keeps validation available without network access and selects the schema version installed by the project. The manifest identifier and retrieval policy are recorded in the [decision register](../maintainers/decisions.md#deliberate-boundaries).

The normalized model carries the full manifest meaning; portable, system, and token projections are not duplicated. The private build-JS/portable-system pair is strict across all four identities, so a docs-only source edit can require artifact regeneration even though the manifest's CSS identity and CSS bytes remain stable.

## 6. CLI

The packed package publishes the `vanity` executable:

```text
vanity inspect [manifest] [--json]
vanity explain <semantic-path|module#export[.part]> [manifest] [--json]
vanity roles --for <intent> [manifest] [--json]
vanity examples <token-path> [manifest] [--json]
vanity context [--focus <token-group|module>] [manifest] [--json]
vanity diff <old-manifest> <new-manifest> [--json]
vanity prepare [--config <path>] [--root <path>]
vanity check [--json] [--against <manifest>] [--write-baseline] [--unresolved] [--exceptions] [--derivations] [--roles] [--config <path>] [--root <path>]
```

The omitted manifest defaults to `.vanity/manifest.json`. `inspect` summarizes the canonical system or prints its JSON. `explain` resolves system semantic paths and `<module>#<export>[.<part>]` sources, including each emitted declaration’s component origins, tokens, conditions and CSS. `roles --for` matches words against `usage.for`, descriptions and paths, including singular and plural forms. Partial matches are returned below roles matching more query words; explicit usage matches break ties. The result separates `roles` suggestions from `warnings` matched only through `usage.avoid`, showing the authored text in each case. It does not infer intent from numerical proximity. `examples` lists emitted declarations that reference a token. `context` formats the existing agent context; `--focus` selects a token group or source module and includes referenced dependency roles. Empty variant arms remain partial evidence rather than invented selections.

These four commands emit `vanity.query/1` with `--json`. The envelope names the command, Manifest v5 identities, the manifest file’s write time, newer-source warnings, and the result. The published `@mszr/vanity/query.schema.json` references the manifest schema for declaration records. Human output carries the same snapshot identity and warnings. Querying never evaluates source. For the usual `.vanity/manifest.json` location the source root is its parent; use `--root` when querying a manifest copied elsewhere. `diff` produces `vanity.manifest-diff/1` and categorizes additions, removals, and changes as:

- `compatibility`;
- `css`;
- `runtime`;
- `docs`.

`prepare` reconciles declarations for enabled auto-import module roles from `vanity.config.ts` (or `--config`) without compiling styles or evaluating the system, so a host can run it before `tsc`; [spec-integrations.md §8](./spec-integrations.md#8-integration-adapters) owns the full contract.

`check` evaluates configured systems and every style module through the same compiler and configured client resolver the application uses, without an application build. Vite, WXT and Vitest configurations supply a single headless pipeline that closes after the run. Nuxt assembles its client pipeline during a framework build and is unsupported by this command; use the Nuxt build for its compiler diagnostics.

Contrast results retain their evidence in both JSON and human output. `checked: authored values` describes the selected scheme and axis/case environment. `sampled` names the reachable count, actual grid, worst state and validation profile, and states that the declared range and validation are evidence rather than proof. An unavailable or asynchronous validator is reported as `validator not evaluated`. `explain` includes declared-pairing evidence for the roles involved; APCA Lc is never formatted as a WCAG ratio.

The report distinguishes completed bodies, completed bodies rejected by findings, interrupted evaluation and modules blocked by a failing system. Rejected bodies count as evaluated but have no complete CSS. Independent modules still run. Audits that require missing module or CSS evidence are listed as unevaluated. Exit `0` means no errors, `1` means findings or evaluation failures, and `2` means configuration or resolution prevented the check from running. JSON output is `vanity.check/1`, validated by the published `@mszr/vanity/check.schema.json`, and includes diagnostics, finding identities and evidence, coverage, source snapshot, baseline and comparison results.

`modeStyles` counts observed component structure per axis mode: distinct styles and declarations using a registered condition named `axis.mode`, including property-first conditions. It counts an authored declaration once across its emitted selector arms and reports only modes used. It neither flags structure nor infers modes from arbitrary selectors. Register the qualified condition explicitly; an axis declaration does not register style condition names. The report's coverage states which modules these observations reached, so an incomplete run never claims a complete inventory.

`--against` compares roles with an explicitly supplied manifest through the manifest diff engine, distinguishing added roles, changed values, changed restrictions and removals. Without it, the report states that no comparison manifest was supplied. `--unresolved`, `--exceptions`, `--derivations` and `--roles` expand the respective details in the formatted report; JSON always carries those records.

### Policy baselines

`--write-baseline` writes `vanity.baseline/1` to `vanity.baseline.json` at the project root, or to the path selected by `compiler.baseline`. Check and application hosts read that file through the same compiler reader. Only declarations-policy and token-restriction findings can be accepted; invalid CSS, token-kind mismatches and system errors require a repair. The published `@mszr/vanity/baseline.schema.json` describes the closed format.

An entry identifies the diagnostic code, source module, style export and name, property, condition path and normalized value. Its count records identical authored repeats. Line movement preserves acceptance. An accepted finding stays visible in check and is silent in host builds; it does not prevent later findings from being collected. An absent finding is resolved only after its module's body completes. Interrupted or blocked entries remain unevaluated with a reason and are kept when writing the baseline.

Identity changes constrain the system categories reported. Module recipes, ports, styles, escapes, contrast, and usage are diffed under their semantic category. The formatted output is stable enough for review; `--json` is the integration contract.

The same projections are available programmatically:

| Need | API | Entry point |
| --- | --- | --- |
| Read or validate | `readManifest`, `assertManifest` | `@mszr/vanity/cli` |
| Summarize or explain | `inspectManifest`, `explainManifestPath` | `@mszr/vanity/cli` |
| Check source modules | `checkProject` | `@mszr/vanity/cli` |
| Build or audit | `buildManifest`, `audit`, `formatAuditFindings` | `@mszr/vanity/vite` |
| Diff | `diffManifests`, `formatManifestDiff` | `@mszr/vanity/vite` |
| Build agent context | `buildAgentContext`, `generateAgentContext` | `@mszr/vanity/vite` |

`readManifest()` is asynchronous; the other functions operate on an already loaded manifest or semantic map. `runVanityCli()` is the package launcher used by the executable.

## 7. Diagnostics

Authoring and build failures use the normalized diagnostic delivered by `VanityError`, compiler sinks, and integrations:

```TS
interface VanityDiagnostic {
  code: VanityDiagnosticCode
  severity: 'error' | 'warning' | 'info'
  message: string
  detail?: readonly string[]
  path?: readonly string[]
  file?: string
  line?: number
  column?: number
  endLine?: number
  endColumn?: number
  related?: readonly VanityDiagnosticRelated[]
  fix?: VanityDiagnosticFix
}
```

Compiler call sites may use the authoring-friendly `VanityDiagnosticInput` with a dot-path string or fix string. `normalizeDiagnostic()` makes those arrays and objects before they leave the compiler. `reportDiagnostics()` and `VanityDiagnosticSink` are the one hook-shaped boundary used by Vite/Nuxt and other integrations.

Rendering adds terminal locations and synthetic author frames editors can click. Related sites keep their own location/range. Substrate errors retain their `cause` for maintainers while the primary message uses Vanity language. Putting an `(at file:line)` suffix only in message text does not satisfy locality.

Browser/runtime failures use the separate [`VanityRuntimeError` contract](./spec-runtime.md#9-validation). Both diagnostic families use stable codes and repair guidance.

## 8. Diagnostic house style

Diagnostics state one mistake, name the semantic key, point to the authored site, and provide a repair:

```text
✗ 'color.brand' already exists — addTokens() is additive-only.
  Defined at palette.tokens.ts:8.
  Add a new name, fill a reservation with augmentTokens(), or explicitly overwrite it in the user's system chain.
```

Runtime guards are not added where disjoint signatures can make a mistake obvious at the cursor. Multiple independent errors aggregate only when seeing them together improves the repair loop.

Authoring diagnostics include `VANITY_TOKENS_NUMERIC_KEY` for numeric token names and `VANITY_CONDITION_DESCENDANT` for the advisory descendant-state audit, and `VANITY_SELECTOR_UNANCHORED` for unanchored pseudo keys. Raw-selector axis modes produce `VANITY_SYSTEM_INVALID_AXIS` warnings with an activatable `data()` repair; style modules discovered under Nuxt pages produce `VANITY_STYLE_MODULE_MISUSE` warnings with a move instruction.

`VANITY_AXIS_UNCOVERED` names an unaccounted covered role or an unmatched coverage path at consolidation. Add the missing mode arm or declare the deliberately identical role in the axis's `shared` paths.

## 9. Hover and TSDoc

Public symbols carry a one-line purpose, representative example, and relevant support/degradation note. Named headless conditions show the emitted selector. Hovers use named public types, distinguish conditions from properties and `tdef` from `tdec`, preserve generated auto-import signatures, and never degrade to `any`.

Public-surface hover/TSDoc coverage and consumer testing helpers enforce this contract alongside structured records and diagnostics.

## 10. Audits

The audit taxonomy and system/build scope split are defined in [§3](#3-two-truthful-scopes). Evidence-dependent categories consume explicit integration/runtime evidence rather than guessing from filenames or static selectors.

Audit categories are advisory by default except for `staleDerivations`, which is an error by default because it can make emitted CSS observably wrong. `derivedCaseGrowth` remains advisory because its output is correct but large; every category respects consolidation-time `off`/`warn`/`error` policy and includes a repair direction.

## 11. Agent and DevTools projections

`buildAgentContext(manifest)` derives structured context from the primary system and published modules:

- identities, root, and layers;
- axes and conditions;
- token vocabulary, traits, dependencies, and emitted contexts;
- recipe/anatomy/port module surface;
- escapes, nonportable values, and overwrite cautions.

`generateAgentContext()` renders those facts as Markdown. DevTools reads the same Manifest v5 modules and system map for tokens, usage, declarations, recipes/anatomies, ports, class provenance, conditions, layers, escapes, and contrast. Neither maintains a second source of truth.

The context contains the complete primary token vocabulary; its size grows with the system. For a focused agent task, start with a selected `ds.explain(handle)` or `vanity explain <semantic-path> --json`, then inspect the recorded dependencies, declarations and audit evidence needed for that question. Use full agent context when the job requires orientation across the system. Field documentation distinguishes token fallback from nominal axis default, emitted contexts from live state, and interchange portability from ordinary CSS use.

## 12. Evidence

Permanent evidence covers:

- exact manifest-system/`introspect()` equality;
- deterministic module ordering and independent identity changes;
- token, axis, condition, recipe, anatomy, and port explanation;
- plugin contribution ownership and overwrite/augment history;
- all audit categories and evidence adapters;
- normalized diagnostic sinks, related sites, and clickable author frames;
- Manifest v5 Vite/DevTools/agent projections;
- CLI formatted/JSON behavior;
- published schema and CLI from a freshly packed consumer;
- repository benchmark and package-size baselines.

Test ownership is cataloged in [testing.md](../maintainers/testing.md); performance measurements are recorded in [benchmarks.md](../maintainers/benchmarks.md).
