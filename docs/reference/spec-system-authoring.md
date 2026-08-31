# vanity — spec: system authoring

This contract owns the open system's registration grammar, detached modules, policy book, requirements, named system rules, and plugin ownership.

## 1. Canonical model

> Grow a system additively; consolidate it; style with it.

Shape-data and value-data are distinct:

- shape-data is names, token slots, axis modes, types, traits, callable members, and metadata;
- value-data is the replaceable content stored in known shape.

`add` grows shape and requires absence. `augment` fills an unset shape slot and requires presence. `overwrite` explicitly replaces value-data and may grow shape, but never removes it. Every operation returns a new immutable open system and records provenance.

## 2. Symmetric method table

Both forms exist for every meaningful verb×kind cell. A singular method adds or addresses one top-level name. A plural method accepts a record, callback, matching detached module, or array of independent matching modules.

| Kind | define | add | augment | overwrite | expect |
| --- | --- | --- | --- | --- | --- |
| tokens | `defineTokens` | `addToken` / `addTokens` | `augmentToken` / `augmentTokens` | `overwriteToken` / `overwriteTokens` | `expectToken` / `expectTokens` |
| axes | `defineAxes` | `addAxis` / `addAxes` | `augmentAxis` / `augmentAxes` | `overwriteAxis` / `overwriteAxes` | `expectAxis` / `expectAxes` |
| conditions | `defineConditions` | `addCondition` / `addConditions` | — | `overwriteCondition` / `overwriteConditions` | `expectCondition` / `expectConditions` |
| consts | `defineConsts` | `addConst` / `addConsts` | — | `overwriteConst` / `overwriteConsts` | `expectConst` / `expectConsts` |
| utils | `defineUtils` | `addUtil` / `addUtils` | — | — | `expectUtil` / `expectUtils` |
| rules | `defineRules` | `addRule` / `addRules` | — | `overwriteRule` / `overwriteRules` | `expectRule` / `expectRules` |
| constructors | `defineConstructor` / `defineConstructors` | `addConstructor` / `addConstructors` | — | — | `expectConstructor` / `expectConstructors` |
| policies | `definePolicies` | `addPolicy` / `addPolicies` | — | `overwritePolicy` / `overwritePolicies` | `expectPolicy` / `expectPolicies` |
| plugins | `definePlugin` | `addPlugin` | — | — | `expectPlugin` |

The absences are semantic:

- atomic conditions and consts have no partial slots to augment;
- replacing utility or constructor code behind an existing name is unsafe;
- plugins are identified capability units, so user naming, bulk mount, and overwrite would weaken identity and diagnostics.

Every value-producing add/augment/overwrite accepts `value | (ds => value)`. The callback sees the complete accumulated system before that link. `expect*` is direct because it asserts shape and computes no value.

## 3. Detached modules

Every registrable data kind has a detached definition:

```TS
const conditions = defineConditions()
  .add('compact', '&[data-density=compact]')
  .add(m => ({
    interactive: `${m.compact}:hover`,
  }))

const axes = defineAxes()
  .add('density', ['comfortable', 'compact'])

const constants = defineConsts({ base: 4 })
  .add('doubled', m => m.base * 2)
```

All builders use one scoped `.add()` grammar:

```TS
defineXs(seed)
  .add('name', value)
  .add('name', m => value)
  .add({ name: value })
  .add(m => ({ name: value }))
  .add(module)
  .add([moduleA, moduleB])
```

Builder callbacks see only the accumulated module. System callbacks see the accumulated system. This separation keeps portable modules self-contained and system dependencies explicit.

Module arrays are sequential mount sugar. A later system callback sees all mounted shape. Modules inside one array remain independently authored; a cross-module dependency belongs in builder composition or a system callback.

Token modules retain their richer `refs`, `$axes`, `root()`, and token definition grammar, but share the same `.add()` verb. There is no `.t()` alias.

## 4. Singular and plural authoring

Singular names are top-level only:

```TS
createSystem()
  .addToken('brand', 'red')
  .addAxis('density', ['comfortable', 'compact'])
  .addConst('base', 8)
  .addUtil('double', (value: number) => value * 2)
```

Nested names use a plural tree:

```TS
createSystem().addTokens({
  color: { brand: 'red' },
})
```

Dotted singular paths are intentionally absent. They produce weak completion, ambiguous constructor/policy paths, and a second tree dialect.

Plural patch methods accept detached modules and arrays too:

```TS
open
  .overwriteTokens([tokenPatchA, tokenPatchB])
  .augmentAxes(axesPatch)
  .overwriteRules([rulePatch])
```

Each module is applied in order, so intent guards and provenance behave exactly as repeated method calls.

## 5. Augment and overwrite

Both are partial:

```TS
open
  .augmentAxis('scheme', {
    modes: { system: '&[data-scheme=system]' },
  })
  .overwriteAxis('scheme', {
    modes: { dark: '&[data-scheme=night]' },
    description: 'application color scheme',
  })
```

`augment` rejects any authored leaf that was already set and points to `overwrite`. `overwrite` may replace existing values and add new shape but cannot remove a token slot, axis mode, name, trait, or metadata field. Provenance derives added-versus-replaced paths from the known prior shape.

Conditions and consts are atomic values: overwrite replaces the named value. Rule `css` is value-data and is replaced wholesale. Rule description, layer, and order remain unless explicitly patched.

## 6. Recursive utility trees

Utility namespaces merge recursively:

```TS
createSystem()
  .addUtils({ mx: { circle } })
  .addUtils({ mx: { badge } })
```

The result exposes both `ds.mx.circle` and `ds.mx.badge`.

The additive guard operates at leaves:

- namespace + namespace recurses;
- absent namespace or leaf adds;
- duplicate leaf fails at its full path;
- namespace/function collision fails at its full path;
- a collision with any core/open-system member fails;
- provenance and plugin ownership use complete leaf paths.

A utility function is itself a function, so `addUtil('name', fn)` and `defineUtils().add('name', fn)` unambiguously add the function. A utility that needs accumulated module context uses the plural callback:

```TS
defineUtils().add(m => ({
  next: value => m.previous(value),
}))
```

## 7. Callable constructor families

Definitions are detached from mounting:

```TS
const tone = defineConstructor('tone', {
  call: (base: VanityColorish) => oklch.from(base, {}),
  vivid: (base: VanityColorish) =>
    oklch.from(base, { c: channel.multiply(1.2) }),
})

const open = createSystem().addConstructors(tone)
open.tone('red')
open.tone.vivid('red')
```

`call` supplies the callable value. Every other property is a call-like family member and remains exact through completion, package declarations, policy projection, and introspection. Constructor closures exist only in the in-process build contract and lower before portable/browser/SSR artifacts.

Constructor definitions and utilities are code: neither can be overwritten.

## 8. Policy book

The system configuration is its initial policy book:

```TS
createSystem({
  constructors: {
    length: { unitless: 'rem' },
    oklch: {
      restrict: {
        level: 'discourage',
        use: 'tone',
        reason: 'Use the product color family.',
        enforce: 'prospective',
      },
    },
  },
  support: {},
  layerOrder: ['reset', 'base', 'app'],
  reference: 'var',
  validation: 'strict',
})
```

This is equivalent to `createSystem().addPolicies(config)`.

Known top-level groups are `constructors`, `support`, `layerOrder`, `reference`, `validation`, and `plugins`. Constructor names form an open subfamily for built-in, user, and plugin constructors. Plugin policy data is auto-scoped by plugin identity.

Conformance policy adapts unresolved values at system entry. Restriction policy is metadata and diagnostics, never shape subtraction. `forbid` fails consolidation, `discourage` warns and compiles. `prospective` covers later contributions; `retroactive` scans the complete graph.

Only a plugin's setup surface exposes:

```TS
registerPluginPolicy(valueOrCallback)
```

It records readable/introspectable data about that plugin's own configuration. It cannot write host-global policy.

## 9. Named system rules

Named system rules contribute system CSS that emits once:

```TS
createSystem().addRules({
  reset: {
    description: 'natural box model',
    layer: 'reset',
    css: {
      '*, *::before, *::after': { boxSizing: 'border-box' },
    },
  },
})
```

Rule identity is its name. Duplicate add fails. Cross-rule order is layer order; within a layer registration order is the default and numeric `order` is the deliberate escape. Rules may contain any number of selectors and nested rules; that is expressibility within one named contribution, not a separate public grouping concept. Named rules appear in compatibility/CSS/docs identities, the portable contract, `introspect()`, provenance, and diffs.

`overwriteRule(s)` patches metadata and replaces `css` when supplied. Styling emitters do not cause a named rule to emit more than once.

## 10. Requirements and plugin ownership

Every dependency kind is granularly expectable. `expect*` declares that a named shape or capability must be supplied outside the current definition; it does not claim ownership. Tokens/axes/conditions/consts/policies check shape; utils/rules check complete-path/name identity; constructors check existence; plugins check id.

A plugin may add an exact literal axis it genuinely owns:

```TS
definePlugin({
  id: 'org.example.density',
  version: 1,
  setup: ds => ds.addAxis('density', ['comfortable', 'compact']),
})
```

The returned chain retains the literal `density` and its mode union. If the host already owns the name, ordinary additive collision law applies.

The same projection law applies to every plugin contribution. Token trees, constructor families, recursively nested utils, consts, conditions, axes, and named rules all remain exact on the returned open system. A plugin’s declared contribution type carries its axes and rules even though those members live in the open system’s dedicated `axes` and rule registries.

Externally supplied wiring remains a requirement:

```TS
setup: ds => ds.expectAxis('scheme', ['light', 'dark'])
```

This is the honest choice for root selectors, native synchronization, or other policy the plugin should not silently own. A system host is one common supplier, but the requirement itself does not prescribe who owns it.

## 11. Scale and diagnostics

Singular system links are delightful for a handful of contributions but spend TypeScript accumulation budget. More than 40 singular additions produce a helpful consolidation diagnostic pointing to plural/module authoring. It is a teaching nudge, not a failure.

Scale evidence uses realistic 500-item modules and plural mounts rather than long singular chains.

For each overload family, tests cover:

- completion and compact hover at the real call site;
- contextual callback shape;
- direct/record/callback/module/array acceptance;
- duplicate/unknown names localized to the offending argument or property;
- runtime intent guards and exact full-path messages;
- immutable branch isolation;
- declaration/package projection;
- a realistic type-instantiation budget below TS2589.
