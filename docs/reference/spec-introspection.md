# vanity — spec: introspection, diagnostics, and agent surfaces

Introspection is a primary product surface. A human, editor, CI job, or agent can ask the system what exists, why it exists, where it came from, and what a change affects without evaluating style modules or reverse-engineering CSS.

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

Parallel provenance registries are prohibited. The portable `vanity.system/1` compiler artifact remains a private interchange form because it carries restoration data; tools see the normalized semantic map instead.

## 2. Contract introspection

```TS
const map = ds.introspect()
```

The result is immutable, deterministic `vanity.introspection/1` data. Its top-level `version` is `1`, and it carries the independent compatibility, CSS, runtime-schema, and documentation identities.

The map contains:

- tokens with stable semantic paths and the full authored/emitted record;
- environmental axes and their modes, triggers, priority, locality, runtime controls, native policy, and description;
- conditions with their readable form, exact lowered arms, and immutable AST;
- declared roots and ownership;
- ordered cascade layers;
- installed plugins and all engine extensions;
- constants;
- engine policies and support target;
- built-in, plugin, and user-defined constructors;
- registered utility paths;
- the portable runtime schema;
- ordered overwrite and augmentation history;
- consolidation-time audit policy.

Every semantic entry has an `id`, `kind`, and `owner`. `declaredAt` is included when the compiler owns an exact source location. Plugin contributions retain their plugin owner rather than being flattened into anonymous system members. Module-root tokens retain their module owner. Source IDs are slash-normalized and package/project relative in emitted artifacts.

Token records preserve:

- type, `reference`, `emit`, `mutable`, and default/reservation state;
- authored expression and inference reasons;
- fold status and refusal reason;
- semantic dependencies and support requirements/fallbacks;
- exact declarations, selectors, at-rules, layers, branches, and cases;
- custom-property registration;
- runtime semantic addresses and opaque slots;
- interchange portability and extension identity;
- deterministic preview and its selected environment;
- metadata, description, deprecation, and source.

The semantic map is query data. Calling `introspect()` does not emit CSS.

## 3. Two truthful scopes

`ds.introspect()` knows the consolidated system synchronously. It cannot know style modules the compiler has not evaluated.

Manifest v3 therefore has two scopes:

```text
system     exact ds.introspect() projection
modules    classes, recipes, anatomy, ports, escapes, contrast, token usage
```

No global registry pretends the locked system knows future style output.

## 4. Structured explanation

```TS
const token = ds.explain(ds.t.color.brand)
const condition = ds.explain(ds.conditions.wide)
const axis = ds.explain(ds.axes.scheme)
const component = ds.explain(button)
const input = ds.explain(button.ports.tint)
```

Tokens, axes, conditions, recipes, anatomies, and ports return structured semantic data. Token explanations include authored expression, reference/fold decisions, dependencies, support, preview, declarations, runtime addresses, portability, and ownership. Recipe/anatomy explanations include variants, toggles, defaults, parts, and published ports. Port explanations include type, default, validation, description, and deprecation.

`formatExplanation()` renders stable human output. Formatted prose is a view of the structured result, never the API of record. A semantic path such as `color.brand` can be resolved by the CLI without loading TypeScript.

## 5. Manifest v3

On each successful build/update the compiler writes `.vanity/manifest.json`, serves the same snapshot at `/__vanity/manifest.json`, and renders its DevTools view at `/__vanity/`.

The manifest contract is:

```TS
interface VanityManifest {
  $schema: 'https://schemas.mszr.dev/vanity/manifest-3.schema.json'
  format: 'vanity.manifest/3'
  version: 3
  system: VanitySystemMapV1
  systems: Readonly<Record<string, VanitySystemMapV1>>
  modules: Readonly<Record<string, VanityManifestModule>>
}
```

`system` is deeply and byte-order equal to `ds.introspect()`. `systems` contains additional compatibility-distinct systems only; the primary is not duplicated. Modules group source-local recipes/anatomies, ports, styles, escapes, and contrast. The `$project` module owns aggregate token-use counts because concatenated CSS cannot truthfully assign those counts to one source file.

The published schema ships as `@mszr/vanity/manifest.schema.json`. Objects use sorted keys, unordered record arrays use semantic-ID order, and semantic arrays such as layer/axis/overwrite order retain authored meaning. Documentation-only edits change the docs identity and manifest while leaving the CSS identity and CSS artifact stable.

The normalized model carries the full manifest meaning without duplicate portable/system/token projections do not.

## 6. CLI

The packed package publishes the `vanity` executable:

```text
vanity inspect [manifest] [--json]
vanity explain <semantic-path> [manifest] [--json]
vanity diff <old-manifest> <new-manifest> [--json]
```

The omitted manifest defaults to `.vanity/manifest.json`. `inspect` summarizes the canonical system or prints its JSON. `explain` resolves system and module-level semantic paths. `diff` produces `vanity.manifest-diff/1` and categorizes additions, removals, and changes as:

- `compatibility`;
- `css`;
- `runtime`;
- `docs`.

Identity changes constrain the system categories reported. Module recipes, ports, styles, escapes, contrast, and usage are diffed under their semantic category. The formatted output is stable enough for release review; `--json` is the integration contract.

## 7. Diagnostics

The normalized diagnostic delivered by `VanityError`, compiler sinks, and integrations is:

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

## 8. Diagnostic house style

Diagnostics state one mistake, name the semantic key, point to the authored site, and provide a repair:

```text
✗ 'color.brand' already exists — addTokens() is additive-only.
  Defined at palette.tokens.ts:8.
  Add a new name, fill a reservation with augmentTokens(), or explicitly overwrite it in the user's system chain.
```

Runtime guards are not added where disjoint signatures can make a mistake obvious at the cursor. Multiple independent errors aggregate only when seeing them together improves the repair loop.

## 9. Hover and TSDoc

Public symbols carry a one-line purpose, representative example, and relevant support/degradation note. Named headless conditions show the emitted selector. Hovers use named public types, distinguish conditions from properties and `tdef` from `tdec`, preserve generated auto-import signatures, and never degrade to `any`.

Public-surface hover/TSDoc coverage and consumer testing helpers enforce this contract alongside structured records and diagnostics.

## 10. Audits

The established lanes remain:

- unused tokens and near duplicates;
- contrast acceptances;
- escape inventory and raw assertions;
- scale strays;
- focus visibility and specificity contexts;
- nonportable values;
- ambiguous axes and mutable-root hazards;
- property-alias escapes.

The release audit includes:

- overwrite/augment inventory from the canonical history;
- eager style-barrel evidence;
- CSS parity-gap evidence;
- stale portable-artifact evidence;
- root/mode disagreement evidence.

The latter four consume explicit integration/runtime evidence rather than guessing from filenames or static selectors. Every lane is advisory by default, respects consolidation-time `off`/`warn`/`error` policy, and includes a repair direction.

## 11. Agent and DevTools projections

`buildAgentContext(manifest)` derives bounded structured context:

- identities, root, and layers;
- axes and conditions;
- token vocabulary, traits, dependencies, and emitted contexts;
- recipe/anatomy/port module surface;
- escapes, nonportable values, and overwrite cautions.

`generateAgentContext()` renders those facts as Markdown. DevTools reads the same Manifest v3 modules and system map for tokens, usage, declarations, recipes/anatomies, ports, class provenance, conditions, layers, escapes, and contrast. Neither maintains a second source of truth.

## 12. Evidence

Permanent evidence covers:

- exact manifest-system/`introspect()` equality;
- deterministic module ordering and independent identity changes;
- token, axis, condition, recipe, anatomy, and port explanation;
- plugin contribution ownership and overwrite/augment history;
- all audit lanes and evidence adapters;
- normalized diagnostic sinks, related sites, and clickable author frames;
- Manifest v3 Vite/DevTools/agent projections;
- CLI formatted/JSON behavior;
- published schema and CLI from a freshly packed consumer;
- repository benchmark and package-size baselines.

Test ownership is catalogued in [testing.md](../maintainers/testing.md); performance history is recorded in [benchmarks.md](../maintainers/benchmarks.md).
