# vanity — spec: tokens

Tokens are named design decisions in an additive typed graph. One semantic token subject is exposed through context-specific interfaces:

```text
semantic token subject
  ├─ token definition       (portable authored meaning)
  ├─ logical token handle   (open system)
  ├─ resolved token handle  (locked/build context)
  ├─ restored token handle  (application/SSR context)
  └─ token control          (runtime controller; mutable addresses only)
```

## 1. One builder

There is one token builder and one accumulation method:

```TS
const palette = ds.defineTokens()
  .add('hue', 264)
  .add('brand', m => ds.oklch(0.6, 0.15, m.hue))
  .add(m => ({
    canvas: ds.oklch.from(m.brand, { l: 0.98 }),
    ink: ds.oklch.from(m.brand, { l: 0.15 }),
  }))
```

`.t` accepts:

1. `name, value/config`;
2. `name, callback(previous siblings)`;
3. `callback(entire prior accumulated tree)`;
4. another token builder to merge at the current level.

Numeric token keys are rejected with `VANITY_TOKENS_NUMERIC_KEY`: eagerly available keys fail at registration, and keys returned by a callback fail when consolidation evaluates it. Use `s500` or a word so every token projection has an addressable name.

Every form adds. No form replaces. A callback cannot read siblings created in the same batch; split those into sequential calls so the dependency is typed.

The chain is immutable, exact, and duplicate paths fail locally.

## 2. Definitions

Tree syntax uses `ds.tdef()` because `{ val: 'red' }` is otherwise ambiguous with a group:

```TS
const tokens = ds.defineTokens({
  color: {
    brand: ds.tdef({
      val: 'red',
      mutable: true,
      description: 'Primary brand color',
    }),
  },
})
```

`.add('brand', { val: 'red', mutable: true })` accepts the raw config because that position cannot be a group. Wrapping it in `tdef` is rejected as unnecessary ceremony.

Typed variants such as `ds.tdef.color()` exist for reservations or values whose type cannot be inferred. At build, bare and configured literal values use the same compiler grammar: explicit dimensions, percentages, quoted strings, hexadecimal colors and unambiguous typed functions retain their data type. An alias keeps its dependency’s type. A named color, unitless zero, variable reference or ambiguous calculation remains unknown and receives an informational definition hint with a typed spelling; it is not newly rejected. Typed constructors make the intent explicit and retain the strongest cursor inference.

Definition fields preserve independent traits:

- `val`;
- `reference: 'val' | 'var'`;
- `emit`;
- `mutable`;
- `axes`;
- `cases` where retained by the normalized model;
- `register`;
- `description`, `usage` guidance and deprecation metadata;
- `restrict` declaration-property contracts;
- `range` inclusive domains for mutable number, integer, percentage, angle, time and length tokens;
- validation;
- checks and portability metadata.

### Guidance and declaration restrictions

`usage: { for: ['divider', 'quiet outline'], avoid: 'text and icons', tier: 'primitive' }` explains role intent. Guidance appears in native token hovers, explanations, agent context and nearest-role diagnostics. It never rejects authoring; only an enabled declarations policy acts on primitive tier. Editing guidance changes the docs identity without changing CSS, compatibility or runtime identity.

`restrict: { properties: ['borderColor', 'outlineColor'], level: 'forbid', reason: 'Hairlines need an edge role.' }` limits declaration uses independently of the declarations policy. Properties use camelCase CSS names, without wildcard syntax. A shorthand includes its longhands and their logical group: `borderColor` permits `borderTopColor`, `borderInlineStartColor`, `borderInlineColor` and the color component of a `border` value. It does not permit `color` or the width component of a border. The compiler reads the finalized declaration components; it does not infer token identity from equal serialized values.

Uses outside that contract produce `VANITY_TOKEN_RESTRICTED`. `discourage` warns and compiles; `forbid` rejects after the module's findings are collected. Choose a role for the property, or label a deliberate exception with `unsafe.value(value, reason)`. A restriction edit changes compatibility, without rewriting system CSS or runtime state. Check's explicit comparison reports changed restrictions separately from changed values.

`range: [min, max]` declares a mutable token's runtime domain. Bounds must be ordered and comparable without layout; absolute lengths and time units convert exactly, while other lengths must use one unit. Angles convert exactly between `deg`, `grad` and `turn`; `rad` compares only with `rad`. Generated application backing includes the comparator only for systems that declare a range. Runtime validation checks the range after a schema's output or fallback. A range edit changes runtime identity without rewriting system CSS. See [runtime validation](./spec-runtime.md#9-validation) for canonical validator inputs, units and snapshot replay.

Nearest-role suggestions follow the authored `deprecated: { reason, use }` replacement path and retain the replacement's guidance. A missing replacement cannot be guessed from value equality.

Absent, reserved-without-value, and CSS `unset` are distinct states.

`token.$case(when)` selects an authored address exactly. A literal address retains that case's value type; a variable spanning several authored addresses returns their possible value types. Extra keys and unauthored combinations are rejected. A `null` reservation has `$val: undefined`, and runtime controls preserve this inference while adding setters only for mutable tokens.

## 3. Policy and inference

The zero-config shorthand remains inspectable and CSS-reactive:

```text
reference: 'var'
emit: true
```

A project may choose another policy explicitly. Optimizer improvements never change public token representation silently.

Rules:

- axes or mutability force an emitted var binding;
- mutable implies `reference: 'var'`;
- a runtime-dependent derivation cannot masquerade as a compile constant;
- incompatible explicit traits fail at the field;
- no-default typed reservations retain identity and type;
- `reference: 'val'` means resolved expression, not necessarily folded primitive.

## 4. Registration

`@property` is a token-definition trait:

```TS
ds.tdef({
  val: ds.oklch(0.6, 0.15, 264),
  register: true,
})
```

Vanity derives syntax and initial value where valid. Object form may override derived fields.

Contracts:

- syntax derives from the CSS data type;
- unknown/composite defaults to `'*'`;
- `inherits` defaults to `true`;
- non-universal syntax requires a computationally independent initial value;
- `var()` and relative units such as `em` are not computationally independent;
- a universal reservation may omit initial value;
- a typed reservation without a valid initial value receives a local fix;
- registration emits once as an unlayered at-rule;
- `register: true` plus `mutable: true` is the canonical animatable runtime knob;
- non-inheriting registrations cannot be used through subtree `tdec` propagation.
- a typed registered custom property computes at its declaration element; it cannot silently freeze a token whose `lightDark()` contract promises consuming-element scheme selection;
- that combination requires explicit root-bound semantics or a universal registration that honestly preserves the token stream.

## 5. Modules and composition

Canonical system-bound form:

```TS
const module = ds.defineTokens({
  color: {
    brand: 'red',
  },
})
```

Top-level `defineTokens()` exists for portable modules and accepts only plain values and callbacks. System constructors, axes, and policy-aware definitions require `ds.defineTokens`.

That boundary is enforced at the cursor and at runtime: a portable module cannot capture a system-bound `tdef` or raw token-trait config and later claim to be context-free.

Composition is explicit handoff:

```TS
ds.defineTokens({
  controls: controlTokens,
})

ds.defineTokens({
  radius: {
    sm: '4px',
  },
}).add(controlTokens)
```

Literal spread of a token builder is unsupported. It would materialize identity too early and make every reference an ambiguous relative path.

Builders expose module-relative lazy `.refs` for internal module work. They rebind per mount. External code never reaches into unmounted module refs; after mount it uses the open system's `ds.t`, which carries mount identity.

## 6. Mounting

`addTokens()` registers definitions on the open system. It accepts modules and callbacks over the accumulated system.

Logical open-system `ds.t` exists after registration and carries:

- path;
- data type;
- traits;
- module/mount identity;
- provenance;
- lazy reference semantics.

It has no resolved `$name` or `$var()` until consolidation. The locked tree adds them without changing semantic identity.

## 7. Augmentation

`augmentTokens()` fills unset slots on existing tokens:

```TS
const next = open.augmentTokens(ds => ({
  color: {
    brand: token => token.val(ds.oklch(0.6, 0.15, 264)),
  },
}))
```

Its input mirrors the token tree:

- existing paths complete;
- unknown paths fail with “use `addTokens`”;
- already-filled slots fail;
- `val`, axis methods, and `$axes` bulk forms expose only legal unset target slots;
- provenance records the augmenter.

The real type suite must stress nested augmentation chains before integration.

## 8. Overwrite

`overwriteTokens()` explicitly changes values on existing tokens:

- unknown paths fail with “use `addTokens`”;
- existing shape may grow but never shrink;
- repeated user overwrites are last-wins and all remain in provenance;
- plugin setup never receives this method;
- traits that would invalidate established shape/requirements cannot be removed;
- introspection and audit expose every overwrite mark.

## 9. Axis values

Traits live on the base definition; axis branches carry values only.

Supported forms:

```TS
ds.tdef({
  val: 'red',
  axes: {
    scheme: mode => mode === 'dark' ? 'darkred' : 'red',
  },
})

ds.tdef({
  val: 'red',
})
  .scheme({
    light: 'red',
    dark: 'darkred',
  })
  .scheme({
    dark: modes => modes.light,
  })
```

The `.scheme(...)` spelling above is a manufactured method for an axis literally named `scheme`. There is no `scheme(light, dark)` value constructor; the CSS function constructor is `lightDark(light, dark)`.

Axis-name methods are manufactured from the system’s own axis declarations. Vanity reserves only `$`-prefixed members in that user-shaped namespace, so axis names may not start with `$`; every other axis and mode name, even `constructor` or `__proto__`, is ordinary own data in mode maps, callback inputs, derivation contexts, and bulk branches. The internal `config` and `type` transport fields are not part of the public `tdef` completion surface.

One limit belongs to TypeScript, not Vanity: the compiler counts inherited members as structure. When an axis or mode is named after a JavaScript member such as `constructor` or `toString`, a sparse literal that omits it can fail assignability even though it is valid at runtime. That covers a partial derivation, token axis map, mode map, bulk branch, or case address. Ordinary names keep sparse authoring and inferred branches.

Bulk `$axes` authors one axis branch across a token group:

```TS
const colors = ds.defineTokens({
  color: {
    ink: ds.tdef({}),
    muted: ds.tdef({
      mutable: true,
    }),
    $axes: {
      scheme: mode => ({
        ink: mode === 'dark' ? 'white' : 'black',
        muted: mode === 'dark' ? '#aaa' : '#555',
      }),
    },
  },
})
```

`$axes` is available only on a system-bound `defineTokens()` builder because it resolves known axes and their modes. It preserves exact completion, locality, and large-fixture budgets.

## 10. Base and default mode

`val` is unconditional fallback. An axis default is nominal selection. They are not synonyms.

Sugar:

- `val` may fill missing default-mode branches across axes;
- a sole default-mode value may infer `val`;
- multiple differing default candidates require an explicit `val`;
- explicitly different base/default values are allowed and explained separately.

A token may ignore an available axis entirely. “All tokens vary on axis X” is an explicit group/system check, not a definition default.

### Numeric scales

`scale.linear()` and `scale.modular()` return callable typed scales. A scale resolves a configured named step or any finite numeric step, exposes its immutable `.steps` map, and materializes named values through `.tokens()`:

| Helper | Formula | Options |
| --- | --- | --- |
| `scale.linear({ unit, steps })` | `unit * step` CSS pixels | `unit` is the number of pixels per step; `steps` maps names to numbers. |
| `scale.modular({ base, ratio, steps, unit })` | `base * ratio ** step` in `unit` | `base` defaults to `1`; `unit` defaults to `rem`; `ratio` must be positive. |

```TS
import { scale } from '@mszr/vanity'

const spacing = scale.linear({
  unit: 4,
  steps: { sm: 2, md: 4 },
})

spacing('md') // 16px
spacing.tokens() // { sm: 8px, md: 16px }
```

## 11. Handles and projections

Locked token handles expose:

```text
$name
$path
$var(fallback?)
$val
$axes
$dec
registration, description, provenance, explanation metadata
```

Entries in `$axes` are own branch handles, isolated between systems. Branch handles expose authored value/condition/provenance, not another public `$name`. Runtime-controller token controls add `$set`/`$unset` only for mutable addresses.

### Declaration projection with `$dec`

**Contract — a token can declare itself without becoming a new styling kind.** `$dec` is argless derived data beside `$name` and `$path`.

A leaf uses its own path segment as the declaration key. A group recursively projects leaves named after CSS properties, registered aliases, or custom properties; registered conditions and raw selectors preserve their nesting. Emitted handles project their `var(--…)` reference so the bundle remains themeable. Value-only handles project the folded value.

```TS
const tokens = ds.defineTokens({
  text: {
    body: {
      fontSize: '1rem',
      lineHeight: 1.5,
      hover: { fontWeight: 600 },
    },
  },
})

const withText = ds
  .addCondition('hover', '&:hover')
  .addTokens(tokens)
  .consolidate()

withText.class({ ...withText.t.text.body.$dec })
```

A plain namespace is never flattened. The diagnostic names its invalid children and offers both honest fixes: navigate to the intended leaf bundle, or register/use the intended condition.

`$dec` and `tdec` point in opposite directions:

- `$dec` applies token values as styling declarations;
- `tdec` authors declarations that assign values to token custom properties.

`tdec.propagated` is the graph-aware declaration producer for a local change:

```TS
const midnightCard = ds.class({
  ...ds.tdec.propagated({ surface: { base: '#18181b' } }),
  padding: ds.t.space.md,
})
```

It declares the named tokens, every emitted build-folded token whose value changes under those substitutions in the base or an axis/case context, and every live token whose root declaration reads a property the fragment declares. A browser substitutes `var()` on the element that declares the custom property, and descendants inherit the substituted result, so a live derivation declared at the token root keeps the root's value inside the subtree. Repeating its unchanged expression in the fragment makes the browser substitute it again on the subtree element. Selection follows the CSS references transitively: a live token that reads a repeated live token, or a folded token the fragment re-declares, is repeated as well. A dependent that folds to its previous value in every context, or reads only properties the fragment leaves alone, is not declared. Non-emitted intermediates still participate in resolution but are never published automatically. The graph is resolved from a fresh result map; the locked system and its base token declarations do not change, and the returned record has no placement or emission effect.

The fragment is unconditional, so each dependent it declares must have one value that is correct in every mode. `tdec.propagated` reports `VANITY_TOKENS_INVALID_OVERRIDE` instead of emitting a declaration that would win over an axis or case arm when:

- an affected folded dependent resolves to different values across an axis, an authored case, or an intersection of its upstream axes;
- a live dependent's root declaration differs across an axis or in a case;
- a dependent is mutable, because a subtree declaration would mask its runtime value;
- a dependent is registered with `inherits: false`, because a declaration on the subtree root cannot supply its descendants.

For varying or mutable dependents, name the dependent in the same call to choose its scoped value explicitly, or express the variation as a system axis. Non-inheriting properties require inheritance enabled or declarations on each consuming element. Putting a fragment inside a condition does not bypass these checks: `propagated` produces data without knowing its later placement. Folded checks cover the complete mode product of relevant upstream axes and apply the authored axis order and case priority.

An element-local native scheme dependent is the exception: its base `light-dark()` expression selects the scheme where it is used, so repeating it remains correct in every scheme mode. Root-local scheme selection is not exempt: repeating its expression must not move scheme selection from the root into the subtree. A token named in the call is a substitution, never a repeated dependent; naming it chooses its scoped value explicitly, subject to the same non-inheriting registration restriction as plain `tdec`.

Choose the vocabulary by ownership and variability:

| | Vocabulary | Scope |
| --- | --- | --- |
| axis | declared, finite, system-wide, runtime-controllable, in the manifest | the whole system knows it |
| `tdec.propagated` | ad-hoc, unnamed, local | one component or page owns it |
| `tdec` | ad-hoc, literal, declares exactly the named tokens; dependents keep their root values | you own the consequences |

An axis is a finite system choice; `tdec.propagated` is a local scoped substitution; `tdec` is a direct declaration fragment. The distinction is the same as the distinction between recipes (finite declared choices) and ports (open per-instance values).

Preserve exact system-bound projections:

- `tokensOf`;
- `namesOf`;
- `varsOf`;
- uniform port/recipe projection patterns;
- graph-aware rename across definitions, derivations, mounts, and consumers.

## 12. Interchange and checks

Preserve:

- DTCG 2025.10 resolved snapshots;
- authored `com.mszr.vanity` versioned extension;
- lossless portable graph/branch/registration/metadata round trips;
- plugin codecs with stable identity/version and JSON payload;
- unknown extension preservation;
- explicit synchronous external resolution;
- exact diagnostics for cycles, aliases, unsupported units/spaces, roots, and nonportable expressions;
- contrast, unused-token, scale, axis, portability, root, and registration checks.

Manifest v5 contains one system map plus source-grouped module facts without duplicating the portable compiler artifact.

### Foreground selection

`legibleOn(background)` defines a black or white foreground and enforces APCA Lc 60 by default. `{ contrast: n }` records an explicit accepted threshold. The compiler checks the authored representative in each light/dark scheme and rechecks authored axis modes and cases; an illegible best pairing fails with `VANITY_TOKENS_CONTRAST`, the measured contrast, and the offending context.

A dependency is volatile only when it reaches a mutable token or an unresolved external reference. Immutable aliases, numeric channel tokens, channel operations, and mix percentages do not become mutable merely because their CSS retains a `var()` edge. CSS liveness, mutability, and scheme selection are independent traits across every color-expression family.

Mutable backgrounds are checked at their authored defaults too. Their selected foreground stays fixed while runtime writes can move the background. Register an `addChecks` pairing and declare ranges to sample the retained foreground across reachable writes; passing samples are evidence, not a guarantee over arbitrary writes. Deliberately unfoldable mix shapes retain an explained representative approximation in introspection and contrast audit data. A form with no supported authored representative, such as an unsupported relative-color fold or an external channel without a default, fails with an actionable color diagnostic rather than silently passing a contrast check.

### Cross-token checks

`check.textContrast(text, background)` registers a build-time pairing check for a token module. It defaults to APCA Lc 60; `.aa()` selects WCAG 2 at 4.5, `.aaa()` selects WCAG 2 at 7, and `.lc(min)` selects an explicit APCA threshold:

| Helper | Level |
| --- | --- |
| `check.textContrast(text, background)` | APCA Lc 60 |
| `.aa()` | WCAG 2 contrast 4.5 |
| `.aaa()` | WCAG 2 contrast 7 |
| `.lc(min)` | APCA Lc `min` |

Attach pairings with the immutable, additive `open.addChecks(t => [...])` method before consolidation. Each registered contrast level remains visible in the evidence, including different levels on the same pair. Checks enter the docs identity only; they change neither system CSS nor schema or runtime identity. `consolidate()` has no `checks` option.

```ts
const checked = open.addChecks(t => [check.textContrast(t.color.text, t.color.surface).aa()])
const ds = checked.consolidate()
```

A check resolves both sides in the same light/dark scheme, declared axis mode and authored case. It samples the union of their mutable dependencies with declared ranges. A compiled `legibleOn` pick stays at its authored result for that environment; other foregrounds move with the sampled state. Integer ranges contain only integers, every integer up to 33 states and otherwise 33 distinct evenly spaced integers including both ends. Angle ranges use a 5° grid in the authored units, including radians; other ranges use 33 evenly spaced inputs including both ends. Products above 1,024 points use a reduced grid whose actual dimensions are reported.

Each input passes through the runtime's universal type check, canonicalization, validator policy and output range check. Throwing, omitted and out-of-range writes are unreachable; fallback writes use their accepted output. A development-only validator is sampled in both profiles, with one result when the reachable states agree. Unavailable or asynchronous validators limit the affected samples to `validator not evaluated`; those samples cannot fail the build. A fully evaluated failing sample still fails even when another sample has that limit. Validators must be pure over canonical inputs.

Results carry the shared evidence level plus sample count, step, worst reachable state and profile. A mutable dependency without a range stays at its authored value with a request to declare one. `vanity check`, role explanations and manifest contrast records retain these limits. APCA Lc and WCAG ratios stay separately named. Declared pairings do not establish rendered contrast through opacity, overlays or background images.

### Emission and identity details

Every emitted token declaration retains its effective root, enclosing scopes, layer, module/mount identity, axis/case address, registration, runtime slot, and provenance. Emission remains deterministic:

```text
unlayered @property registrations
→ base declarations
→ axes in consolidated order
→ explicit cross-axis cases
→ subtree/runtime declarations
```

For each axis mode and explicit case, the compiler re-resolves the graph with that branch's token definitions and compares the result with the base graph. Only changed emitted custom properties are written into the existing axis or case arm: build-folded derivations follow their varying inputs, while live derivations keep their `var()` expression and are left for the browser to recompute.

The intersection cost is multiplicative. When a build-folded token varies over `n` contributing axes, its `axisCoverage.requiredCases` can contain up to the product of those axes' mode counts. Each required combination receives an intersection declaration so the folded value remains correct; keeping the derivation live with `reference: 'var'` opts out of that build-time CSS. The `derivedCaseGrowth` audit category is advisory when the required-case count exceeds its documented budget of 32 intersection cases.

References authored through a module’s lazy `.refs` carry module-relative identity in the value graph. Mounting the same module twice rebinds direct aliases and arbitrary expressions independently; no preview `--module-*` name may escape into consolidated output.

Registration remains independent from mutability and reference policy. Non-universal syntax requires a computationally independent initial value; `var()` and relative units are rejected as initial values, while universal reservations may omit one. Registrations emit once and outside layers.

## 13. Evidence

Required fixtures include:

- long and wide chains, callbacks, duplicate guards, package declaration emit;
- nested augment chains, many locked forks, and realistic requirements;
- all shorthand/config/reservation/registration combinations;
- base/default/partial/multiple axes and bulk `$axes`;
- exact handles for authored/reserved branches;
- composition/mount isolation and graph rename;
- val/var/reference propagation;
- root and layer output;
- mutable slots and registration interaction;
- DTCG projections and codecs;
- manifest/explain provenance;
- accepted large-fixture type/editor/declaration budgets.

### Test ownership

- `sdk/src/tokens/builder.{test.ts,test-d.ts,dx.test.ts,out.test.ts}` covers the four builder forms, portable/system boundaries, lazy mount rebinding, `tdef`, reservations, axis methods, `$axes`, base/default rules, patches, roots, anchors, DTCG projection, types, diagnostics, and output.
- `sdk/src/tokens/builder.scale.test-d.ts` forces a 60-link token builder through registration and two locked forks without TS2589.
- `sdk/src/tokens/tokens.rename.test.ts` covers token-builder definitions, callbacks, registration, consolidation, and consumers.
- The existing graph, registration, runtime, DTCG codec/unknown-extension, manifest, explanation, check, projection, and package suites remain the preservation evidence for the semantic substrate rather than being replaced by narrower token-only tests.
