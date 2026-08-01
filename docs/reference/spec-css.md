# vanity — spec: styling and output

The locked system exposes one CSS input language through emitters named for their output.

## 1. Emitter family

| API | Output |
| --- | --- |
| `ds.class(input)` | one generated class |
| `ds.recipe(config)` | finite class-selection function |
| `ds.anatomy(config)` | part-keyed class-selection functions |
| `ds.atoms(config)` | bounded utility-class map and resolver |
| `ds.fragment(input)` | reusable ordered styling data, no selector |
| `ds.rules(map)` | author-specified selector rules |
| `ds.tdec(tree)` | token custom-property declarations as a fragment |
| `ds.keyframes(steps)` | keyframes plus animation-name handle |
| `ds.fontFace(descriptors)` | font-face rule(s) plus family handle |
| `ds.raw(css)` | raw CSS emitted in the declared layer |

This list is exhaustive. A public emitter absent here is a documentation bug.

All emitters consume the same property/value, condition, nesting, selector, at-rule, alias, token-handle, fragment, and raw lanes appropriate to their context.

## 2. Classes

```TS
const card = ds.class({
  display: 'grid',
  gap: ds.t.space.md,
  '&:has(> img:first-child)': {
    paddingBlockStart: 0,
  },
  wide: {
    gridTemplateColumns: '1fr 2fr',
  },
})
```

Contract:

- returns a serializable class handle/string;
- properties are exact and conditions are branded distinctly;
- valid CSS values remain open;
- CSS-wide and grammar keywords remain accepted;
- nesting is unlimited within CSS validity;
- property-first condition maps remain available (`color: { base: ink, hover: brand }`) and lower identically to selector-first condition arms;
- selector interpolation uses imported style handles;
- every declaration is parser-validated;
- number behavior is explicit policy/data, not guessed;
- source/debug/provenance survives lowering.

## 3. Fragments and mixins

A mixin is a normal TypeScript function. `ds.fragment()` is the typed data it may return:

```TS
function useFlex(gap?: string) {
  return ds.fragment({
    display: 'flex',
    gap,
  })
}
```

The fragment factory carries the same configured property vocabulary as `ds.class`, including property aliases and aliases-only policy. Installing an alias plugin never removes fragments, ordered arrays, omission, or selector-map rules from the style language.

Flat fragments may spread into objects when ordinary last-write-wins is intended. Fragments with conditions/nesting use the canonical array form:

```TS
const row = ds.class([
  {
    display: 'flex',
  },
  useFlex(),
  {
    gap: ds.t.space.md,
  },
])
```

Arrays flatten into ordered lossless IR. They do not deep-merge maps or discard repeated declarations.

## 4. Omission

`ds.omit` is a property-valued sentinel that removes a declaration:

```TS
const item = ds.class({
  gap: includeGap ? ds.t.space.md : ds.omit,
})
```

`undefined` is omitted too, for ordinary optional-flow ergonomics. `ds.omit` documents an intentional branch. CSS `unset` always emits the real keyword.

## 5. Token declarations

`ds.tdec()` creates a typed fragment of custom-property declarations:

```TS
const dense = ds.class({
  ...ds.tdec({
    color: {
      brand: ds.oklch(0.55, 0.2, 20),
    },
  }),
  padding: ds.t.space.sm,
})
```

It:

- accepts exact token-tree paths and compatible values;
- re-declares public properties so inheritance re-derives dependents;
- does not rewrite consumer styles;
- rejects a non-inheriting registered token with an explanation;
- records subtree override provenance;
- remains usable at open stage by utils because it can produce data over logical handles.

Definition-plane replacement is `overwriteTokens`; subtree cascade is `tdec`; runtime mutation is `$set`.

## 6. Rules and ordinary TypeScript

There is no iteration DSL. Computed style structures use real TypeScript:

```TS
const scale = {
  sm: 4,
  md: 8,
  lg: 16,
}

ds.rules(fromEntries(
  Object.entries(scale).map(([name, px]) => [
    `.p-${name}`,
    {
      padding: `${px}px`,
    },
  ]),
))
```

Vanity ships small literal-key-preserving helpers (`fromEntries`, `mapRecord`, `range`) because native library typings often widen keys and erase cursor diagnostics.

Every emitter accepts computed/spread inputs without a static-extractor subset.

## 7. Conditions and selectors

Named conditions are bare keys and may nest. Raw selectors and at-rules remain available.

Cross-file structural relationships use imported handles in selector interpolation. Consumer theming of values uses ports.

Anatomy part-scoped keys remain `'<part>:<condition>'`, typed over declared parts and named conditions. They receive distinct hover branding.

## 8. Layers

Every rule belongs to a per-system nested layer. System prefix is the default top-level layer root.

The primary file-level binding is pure:

```TS
import {
  ds as system,
} from './system'

const ds = system.inLayer('components')

export const button = ds.class({
  display: 'inline-flex',
})
```

Per-emitter `.layer(name)` may override it. No ambient `assignToLayer()` mutation exists. Recipe/anatomy do not carry bespoke `layer:` options.

Authored styles default to the first layer after system-owned layers. Unlayered consumer CSS retains ordinary precedence over layered output.

The compiler owns the first-loaded cross-system layer prelude; import order does not.

## 9. At-rules and raw

`keyframes` and `fontFace` retain typed handles and context-specific grammar. Condition keys inside keyframe steps remain errors.

`@scope` is a typed condition/root form.

The rule IR also represents:

- `@property`;
- `@counter-style`;
- `@page` and margin rules;
- view-transition rules;
- grouping/conditional at-rules;
- repeated declarations and fallbacks;
- labeled raw nodes.

Not every at-rule needs a dedicated helper. `ds.raw()` is the complete CSS escape and records layer, source, and audit label/context.

## 10. Validation

Every emitted declaration, selector, query, descriptor, and raw block receives appropriate CSS parsing. TypeScript handles names/data-type compatibility; parsers handle grammar.

Diagnostics:

- use stable codes and structured locality;
- point to the authored property/value;
- distinguish an unknown property from a known property with invalid grammar;
- preserve future CSS through the standards/raw lane;
- wrap compiler/substrate errors;
- recover through HMR after a fix without restart.

A system created in `*.css.ts` receives the dedicated plain-`system.ts` fix, not the substrate's invalid-export error.

Under an aliases-only property policy, `ds.class.standard({...})` preserves exact standard-property object authoring and `ds.raw(...)` preserves full raw CSS. An alias policy may change the preferred completion lane but cannot make a platform property unreachable.

## 11. Delivery

Style delivery is import-driven:

- the compiler performs no repo-wide style scan;
- a style module's CSS follows its JS import and code-splits with lazy routes;
- system CSS is separate and deduplicated;
- unused components are not shipped;
- eager style barrels are documented and audited as splitting hazards;
- precompiled component packages preserve the same model.

## 12. Output evidence

Tests lock:

- exact class/rule/fragment lowering;
- arrays preserving conditional siblings and repeated declarations;
- aliases plus standards/raw escape;
- condition/selector branding and diagnostics;
- root/scope/layer order independent of imports;
- cross-system layer prelude first;
- lazy chunk CSS and system CSS deduplication;
- every at-rule family's placement semantics;
- parser diagnostics and author frames;
- raw audit/provenance;
- optimized browser behavior.
