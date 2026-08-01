# vanity — spec: tokens

Tokens are named design decisions in an additive typed graph. Definition, logical reference, resolved CSS identity, and runtime mutation are phases of one semantic handle.

## 1. One builder

There is one token builder and one accumulation method:

```TS
const palette = ds.defineTokens()
  .add('hue', 264)
  .add('brand', t => ds.oklch(0.6, 0.15, t.hue))
  .add(t => ({
    canvas: ds.oklch.from(t.brand, { l: 0.98 }),
    ink: ds.oklch.from(t.brand, { l: 0.15 }),
  }))
```

`.t` accepts:

1. `name, value/config`;
2. `name, callback(previous siblings)`;
3. `callback(entire prior accumulated tree)`;
4. another token builder to merge at the current level.

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

Typed variants such as `ds.tdef.color()` exist for reservations or values whose type cannot be inferred.

Definition fields preserve independent traits:

- `val`;
- `reference: 'val' | 'var'`;
- `emit`;
- `mutable`;
- `axes`;
- `cases` where retained by the normalized model;
- `register`;
- `description` and deprecation metadata;
- validation;
- checks and portability metadata.

Absent, reserved-without-value, and CSS `unset` are distinct states.

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

Logical open-stage `ds.t` exists after registration and carries:

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
- `val`, axis methods, and `$axes` bulk forms expose only legal unset destinations;
- provenance records the augmenter.

The real type harness must stress nested augmentation chains before integration.

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

The `.scheme(...)` spelling above is a manufactured method for an axis literally named `scheme`. It is not the removed `scheme(light, dark)` value constructor; the CSS function constructor is `lightDark(light, dark)`.

Axis-name methods are manufactured safely because Vanity reserves only `$`-prefixed members in that user-shaped namespace. Axis names may not start with `$`. The internal `config` and `type` transport fields are not part of the public `tdef` completion surface.

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

Branch handles expose authored value/condition/provenance, not another public `$name`. Runtime handles add `$set`/`$unset` only for mutable addresses.

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

Manifest v3 contains one system map plus source-grouped module facts without duplicating the portable compiler artifact.

### Emission and identity details

Every emitted token declaration retains its effective root, enclosing scopes, layer, module/mount identity, axis/case address, registration, runtime slot, and provenance. Emission remains deterministic:

```text
unlayered @property registrations
→ base declarations
→ axes in consolidated order
→ explicit cross-axis cases
→ subtree/runtime declarations
```

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

### Evidence

- `sdk/src/tokens/unified.{test.ts,test-d.ts,dx.test.ts,out.test.ts}` covers the four builder forms, portable/system boundaries, lazy mount rebinding, `tdef`, reservations, axis methods, `$axes`, base/default rules, patches, roots, anchors, DTCG projection, types, diagnostics, and output.
- `sdk/src/tokens/unified.scale.test-d.ts` forces a 60-link unified builder through registration and two locked forks without TS2589.
- `sdk/src/tokens/tokens.rename.test.ts` covers unified builder definitions, callbacks, registration, consolidation, and consumers.
- The existing graph, registration, runtime, DTCG codec/unknown-extension, manifest, explanation, check, projection, and package suites remain the preservation evidence for the semantic substrate rather than being replaced by narrower token-only tests.
