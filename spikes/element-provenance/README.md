# Rendered-element provenance

Can a rendered element yield its style contributions, variant evidence and instance identity, and can its page distinguish current and stale style sources?

Run with the workspace's pinned Node and pnpm:

```sh
pnpm --filter spike-element-provenance check
pnpm --filter spike-element-provenance test
```

The package imports no SDK. `emission-observations.json` contains class strings and CSS observed from real recipe/anatomy emission. `provenance-fixture.json` describes proposed manifest arm classes and property/token/condition entries. That metadata is authored fixture data; it is not a claim that the current manifest producer records those entries. `run.mjs` exercises the independent model in pinned Chromium, `nuxt.mjs` exercises the registry and directive in a real Nuxt page with those emitted styles, and `production.mjs` inspects a production Vite/Vue bundle.

## Sources and selections

An element's class set selects manifest style contributions. Each contribution retains its module, export, part and property-level token/condition records. These are contributions, not browser cascade winners. An anatomy part associates with the nearest ancestor carrying its owner's root class; nested anatomies use the inner root. An orphan can still identify its own source but cannot invent its root's selection.

`model.mjs` enumerates variant and toggle selections, includes compound classes, and compares the complete class set owned by the recipe. It reports only selections shared by all matching candidates. Folded defaults are inferable when they have a unique signature; two empty arms remain partial. A compound can distinguish empty arms, and absence of a compound can constrain a toggle/variant combination. An empty toggle stays unknown. Classes from other styles do not participate in that comparison.

An explicit development binding supplies a selection when classes cannot decide:

```vue
<li :class="row(selection)" v-vanity-variant="{ recipe: row, selection }" />
```

The directive is Vanity-qualified and validates variant names, values, toggles and defaults. Invalid input removes the previous binding and reports errors; updates replace the selection. Recipe metadata in this experiment stands in for the handle's variants/defaults plus emitted-arm metadata. SDK integration must qualify bindings by the recipe's module/export so two recipes on one element cannot borrow each other's selection. Enumeration is a prototype; an integrated implementation must bound its product and keep partial evidence when it cannot decide.

The dev host installs the directive only in development. Vue's production `directiveTransforms['vanity-variant']` lowers it to no props and no runtime directive. The production fixture demonstrates removal of the call, registration, validation model and registry. Disabling a directive hook alone would retain a call and is insufficient.

## Instances

`inspectInstance()` records route, DOM path, sibling index and a bounded text excerpt. A unique `data-vanity-key` gives `app-key`; repeated keys are `ambiguous`. Without an app key, a unique same-tag/text candidate is a weaker `locator`; repeated candidates are `ambiguous` with their count. A path can still point to a different row after reordering, so it cannot promote weak identity to strong identity.

The Nuxt fixture captures the second of two identically styled/textual rows, then reverses them. Its key relocates uniquely to the first position; text supplies two candidates. Application-owned key attributes can support the same mechanism when the host knows which attribute to read; this experiment exercises the explicit Vanity attribute.

## Source versions

The development transform appends a source hash registration to style-module JavaScript. Execution writes to a page-local registry and replaces the entry on re-execution. The registry uses no network acknowledgement. SSR execution cannot write to a browser window; client hydration registers the client module. A full reload creates a fresh page registry.

A source record is `{ disk, ran?, loaded }`: matching hashes yield `true`, different hashes yield `false`, and absence of a page report yields `unverified`. Components and helpers receive no source transform and remain unverified. The Nuxt runner demonstrates initial hydration, HMR replacement, reload and an aborted style update: the first page retains its old hash while a second page loads the current source. Its aborted component update has no page report and stays unverified. The server's last successful transform is never treated as proof for a particular page.

The independent fixture serves recorded emitted CSS while changing the style wrapper's source; it proves wrapper execution and registry behavior. The release probe separately exercises the existing SDK's actual Nuxt style compiler and computed CSS, including 8px → 12px HMR and a denied 20px update. Both legs are needed: this package deliberately does not implement or import Vanity's compiler.

Registration must hash the exact authored input used by the transform, not newer disk contents read after an asynchronous build. The independent model uses stable fixture edits; integrated capture must preserve that boundary. Equal captured/ran source hashes do not establish equal rendered state: parent layouts, helpers, external styles and data can differ. A hash of an executed module also does not establish that every stylesheet was installed; CSS installation is a separate host contract.

## Outcome and limits

The registry mechanism is reliable for the tested hydration, hot-update, reload and aborted-request paths; the all-unverified fallback is unnecessary. Variant inference establishes the shown shapes, not a measured success percentage over every recipe. The release integration rerun feeds produced Manifest v5 class tables and actual recipe/anatomy handles to this unchanged model: folded defaults, empty variants and toggles, compound selections, root/label parts and real styled-row reordering preserve these guarantees. This closes the authored-metadata inference leg for those shapes, without claiming a corpus-wide success rate. Source-span editing and directive ownership still needs module/export qualification, and framework compiler registration/removal still needs SDK integration. Production removal is proven with the native Vue compiler hook and Vite bundle, not a full production Nuxt host integration. Browser cascade explanation is outside this experiment.
