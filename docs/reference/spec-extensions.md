# vanity — spec: plugins, utils, constructors, and policy

Use a normal TypeScript function by default. Register only when the system gains structural knowledge, discovery, compatibility identity, or a namespaced public capability.

## 1. Plugin definition

```TS
import { definePlugin } from '@mszr/vanity'

interface DensityOptions {
  readonly base?: number
}

const densityTools = definePlugin({
  id: 'org.example.density-tools',
  version: 1,
  setup: (ds, options: DensityOptions | undefined = {}) => {
    const base = options.base ?? 8

    return ds
      .addConsts({
        densityBase: base,
      })
      .addUtils({
        densityStep(step: number) {
          return ds.calc(base).multiply(step)
        },
      })
  },
})
```

`setup` returns the accumulated builder. This is required because TypeScript infers contribution shape from the plugin's return type, not from statements in a function body.

## 2. Add and expect

Inside `setup`:

- `add*` contributes names and capabilities;
- `expect*` declares user-provided shape;
- `augment*` may fill unset extension points;
- `overwrite*` is absent.

Requirements are structural and shape-only:

- token paths, data types, mutability, reference, and emission traits;
- axis names and required mode subsets;
- plugin and constructor identity;
- never exact values.

Axis activation capability is a distinct requirement; it is never inferred from selector spelling.

Mounting executes the requirement check at the `.addPlugin()` call. The diagnostic names the plugin, missing capability, and temporal fix:

```text
✗ plugin 'org.example.surface' expects axis 'scheme' (light, dark) — add it before mounting this plugin.
```

Extra host shape is allowed.

## 3. Mounting and options

```TS
const defaults = createSystem().addPlugin(densityTools)
const compact = createSystem().addPlugin(densityTools({ base: 4 }))
```

`definePlugin` returns a callable plugin object:

- uncalled form uses defaults;
- called form carries normalized options;
- required options make the uncalled form a local error;
- plugin identity is `id`, `version`, and normalized options;
- functions and object references never establish compatibility.

Inline plugins are accepted when they carry a stable identity suitable for their semantics.

## 4. Namespaces

A related family should use a namespaced util:

```TS
ds.addUtils({
  elevation: {
    elevate() {
      return 'red'
    },
  },
})
```

A single universal verb may be flat when collision risk and future meaning are clear. Additive-only rejects every collision at the plugin's mount and names the plugin plus the conflicting namespace. System emitters, registration methods, constructors, and prior utilities occupy one reserved top-level namespace, so no contribution can be accepted only to disappear behind a locked-system member later.

The locked system exposes added utils and constructors but no registration methods.

## 5. Constructors

```TS
const withShade = ds.addConstructor('shade', current => ({
  call(lightness: number) {
    return current.oklch(lightness, 0.1, 264)
  },
  from(base: string) {
    return current.oklch.from(base, {
      c: 0.1,
    })
  },
}))

withShade.shade(0.6)
```

Constructor families:

- live on `ds` because the namespace is system-extensible;
- return branded values;
- may reuse `.from`;
- use the public low-level value/operation protocol;
- carry support, folding, portability, diagnostic, and DTCG metadata where needed;
- lower closures before the portable boundary.

Names do not let wrappers masquerade as built-in CSS functions; output brands and parity records preserve the distinction.

## 6. Consts and config

System config contains policy only:

- default units;
- token reference/emission;
- support targets;
- validation behavior;
- naming/layer conventions that change meaning or output.

`addConsts` contains JSON-serializable convenience data. Nonportable values fail at the cursor/build rather than disappearing from the manifest.

Configured plugins and const/util containers take immutable owned copies of plain option/data objects. Vanity never freezes a caller-owned configuration object as a side effect.

Litmus:

- changes semantics or compatibility → policy;
- convenient data to read back → const;
- executable behavior → util/constructor.

## 7. Low-level extension protocol

The implemented public extension substrate preserves:

- CSS data-type identity;
- normalized value and operation IR nodes;
- context-bound serialization;
- exact folding and dependency behavior;
- support requirements/fallbacks;
- stable opaque identity;
- DTCG codecs;
- structured diagnostics and provenance.

Runtime-schema contributions join this substrate through the public runtime contract; they are not a hidden plugin privilege.

Built-ins and Hail receive no private privileges.

## 8. Hail as public-contract dogfood

Hail is the sole export from `@mszr/vanity/presets`. It is assembled from the same public authoring tools available to application and package authors:

- detached constructors and recursively nested utils;
- ordinary token modules and `$dec` declaration bundles;
- an optional plugin-owned or host-expected scheme axis;
- named rule groups;
- plugin-scoped policy and ownership metadata.

Its normalized colors, semantic elevation, sizing, controls, tokens, and rules are specified in [spec-hail.md](./spec-hail.md). The core and standalone elevation/BEM plugins do not ship.

## 9. Deferred surfaces

### Whole-system composition

`addSystem` / `expectSystem` remain deferred until a real multi-package use case proves plugins and token handoff insufficient.

When reconsidered:

- name collisions remain loud;
- policies merge additively;
- equal values merge;
- conflicting values fail with both owners/values;
- performance is spiked against realistic systems.

### Middleware and hooks

No generic lifecycle API ships without a second real consumer. Structured diagnostics ship now. The open rule IR is designed so a future emission transform has a stable input.

### External asset workflows

No SVG/Iconify core API. Ports plus uniform projections are the model. A future content-agnostic substitution projection may rewrite literal attribute values to `var(--port, literal)` while preserving values such as `none` and `currentColor`. It re-enters only after ports and one real consumer exist.

## 10. Evidence

- `sdk/src/system/openSystem.{test.ts,test-d.ts,dx.test.ts}` covers callable configuration, inferred nested utils/constructors/consts, trait requirements, temporal failures, additive setup lineage, overwrite exclusion, stable options identity, and JSON-safe consts.
- `sdk/src/plugins/propertyAliases.*` proves the standard/aliases-only lanes entirely through `createSystem().addPlugin(...)`.
- `sdk/src/presets/hail/hail.{test.ts,test-d.ts,dx.test.ts}` dogfoods public plugins and locks Hail’s exact behavior, types, hover, completions, diagnostics, selection, and ownership.
- emitted package declarations expose a compact named Hail contract; browser/SSR projection tests keep setup closures out of portable artifacts.
