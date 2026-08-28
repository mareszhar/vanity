# vanity — flagship and comparison demos

The demos are product evidence. They make Vanity's capabilities tangible, show what delightful daily authoring feels like, and catch real integration failures. Architecture owns API decisions; art direction is a presentation choice. The concepts, standards, and capability coverage below are the contract.

## 1. Roles

- `sandbox/demo-main` is **Prism** — a design-system _studio_: a live specimen of one TypeScript design system, not a product mockup.
- `sandbox/demo-comparisons` applies one small shared brief across vanity and maintained peer approaches, so the **source itself** is the comparison.
- Behavioral coverage is permanent; visual concepts and component structure may evolve when a stronger showcase makes the capabilities clearer.

## 2. The flagship concept: a design-system showcase, not a product

The visitor understands within a minute that one coherent TypeScript design system drives the whole interface. The page is a **design-system reference** — palette, surfaces, type scale, spacing, components with their variants, and capability demos — never a dashboard, inbox, storefront, or the mockup of any product. A studio control rail sits beside the specimen; moving a control re-derives the system, not a pile of disconnected inline values.

Forbidden framings: product dashboards, fictional users or personas, region- or person-specific copy, invented brands. Content speaks about the design system itself.

### 2.1 Studio controls (all live, all one system input each)

- **Hue** — a single OKLCH hue channel is the only mutable palette input. Accent, neutral surfaces, interaction states, and legible foregrounds all derive from it. The scrubber's track _is_ the hue spectrum; there is never a second decorative bar beside the real input.
- **Radius** — a mutable seed length; the component radius scale derives from it, with deliberate pill/circle exceptions preserved.
- **Density** — compact / cozy / spacious, affecting spacing, control size, layout rhythm, and the density arm of the shadow tokens.
- **Typeface** — mono / serif / sans, swapping a mutable font-family token over self-hosted faces with real fallbacks and stable layout.
- **Appearance** — system / light / dark from **one** semantic token set via elevation, never a parallel dark palette. System follows the platform; an explicit choice wins predictably and survives SSR/hydration, even when it opposes the OS preference.
- **Motion** — none / subtle / springy retune shared durations and easings. `prefers-reduced-motion` is authoritative over all three, and "none" never depends on JavaScript racing CSS.
- **Presets** — four to six fixed points in the same space the randomizer samples, each producing a distinct, recognizable identity.
- **Surprise me** — a valid random combination; every control remains independently understandable afterward.

### 2.2 Color derivation standards

- Colors are authored channel-first: the runtime-addressable hue is its **own** token/custom property, so a control writes one channel and the authored lightness/chroma keep flowing through HMR. A control must never re-serialize a whole color (`oklch(L C ${hue})` in app code is the anti-pattern that defeats the token graph).
- Neutrals are the brand seed run through an elevation curve, so both schemes and every surface role fall out of one token set.
- Foregrounds on any brand/status/colored surface use a checked legible pairing (`legibleOn()` or an equivalent) so text stays readable across the supported hue range. Where a live target cannot be build-checked, the design constrains the surface (e.g. a bounded lightness) so the checked foreground stays correct.

## 3. Capability coverage

The showcase exercises capabilities because they improve the result, not as a checklist gallery:

- modular `open.defineTokens()` builders handed through additive `.add()` stages and composed into one `open.addTokens(...).consolidate()` result;
- axes (scheme/density/motion), partial modes, and — where the platform allows it honestly — sparse cases and deterministic axis order;
- CSS-reactive derived values and runtime-mutable color and non-color tokens;
- `ds.runtime()` with validated setters, `$unset()`, snapshot persistence, SSR projection via `runtimeProps()`, and hydration with no theme flash;
- recipes, anatomy (with part-scoped conditions), ports, atoms, Hail’s semantic elevation/BEM utilities, and standards/raw escape lanes (e.g. `@starting-style`);
- media queries for viewport/preferences and **container queries** for an independently responsive specimen that visibly reorganizes;
- selectors, `:focus-visible`, keyframes/transitions, self-hosted `@font-face`, layers, and custom-property integration;
- `ds.explain()` provenance surfaced in an inspector that answers "why does this look this way?" without exposing private slot names;
- build-time CSS output that stays readable in DevTools.

## 4. Implementation standards

The flagship is Nuxt + Vue + Pug + TypeScript. vanity owns all authored styling; no second CSS-in-TS framework, utility-CSS system, or themed component library.

- **Template first, script second.** SFCs use `<template lang="pug">` then `<script setup lang="ts">`.
- **No component/style colocation.** Components live in `app/components`; their style modules live apart (e.g. `app/assets/styles/components/*.css.ts`), reached by a stable alias (`import * as s from 'styled/Name.css'`) rather than fragile relative paths. Design-system styles live in `app/assets/styles/design`.
- **Lane-specific auto-imports, not a mirrored API.** Nuxt-native helpers remain Nuxt-owned; Vanity's runtime helpers are an explicit `app.runtimeAutoImports` choice in `nuxt.config.ts`. `compiler.styleAutoImports` injects the exact locked `ds` value plus the deliberate authoring bindings from `design/authoring.ts` into evaluated `*.css.ts` files only. Longer style modules use those bindings directly (`cls` for the canonical `ds.class`, `t` for tokens); concise reference examples keep the explicit `ds.class` form. Nuxt generates the exact `typeof` ambient declarations, and no hand-maintained global surface exists. The app's own `app/utils` barrel remains the deliberate source for its `ds` and font exports.
- **`import * as s`** keeps a component's styled imports to one concise line so the TypeScript reads clearly.
- **OKLCH only.** Every authored color is an OKLCH value or a token derived from one. No hex/rgb/hsl literals, including hidden fixtures.
- **HMR is real.** Editing a token module updates the running studio; interactive controls move custom properties and axis attributes, never redefine the values the graph already owns.
- **Comments are scarce and intent-level.** Naming carries the meaning.
- **Polish is structural.** Hierarchy, semantic grouping, rhythm, and spacing do the work; inputs (sliders, dropdowns, toggles, fields, segmented controls) are ergonomic and free of basic defects (cramped carets, undersized icons, missing focus states).

Inline styles are limited to platform/runtime values whose contract requires them — runtime custom-property projection or third-party geometry — never authored component styling.

## 5. Comparison demo

The comparison answers a narrower question: how do current styling approaches express the same small, polished, interactive design-system change? The **code is the deliverable** — a reader should be able to compare each lane's ergonomics, type behavior, and emitted output side by side.

- One responsive card/workflow with variants, states, a token/scheme change, and a live value — small enough for credible parity, not a clone of the studio.
- Use each maintained lane's current official idioms; do not hobble peers or hide their strengths.
- Keep shared content, component behavior, viewport scenarios, and visual acceptance fixtures across lanes.
- Measure authoring shape, type/editor behavior, emitted output, runtime cost, and a maintenance-change scenario; never declare a winner from line count alone.
- Revisit the lane list before releases so stale comparisons do not masquerade as ecosystem truth.

## 6. Acceptance evidence

The flagship is complete only when:

1. every studio control changes the intended system decisions and resets cleanly;
2. light/dark/system, persisted overrides, SSR, hydration, and HMR pass without flash or state loss — including an explicit scheme that opposes the OS preference;
3. narrow-phone, tablet/widget-container, and wide-desktop layouts have deliberate, browser-tested compositions;
4. keyboard navigation, focus visibility, landmarks, labels, contrast, reduced motion, and zoom meet the accessibility gate;
5. the browser suite asserts computed design outcomes, not merely that the page rendered;
6. the inspector can trace representative palette, elevation, density, shadow, and motion results through `ds.explain()`;
7. production CSS survives the supported optimizer/toolchain matrix with no unexplained console/resource errors;
8. public examples extracted from the demo compile from the packed package, not workspace-only aliases;
9. the comparison lanes retain behavioral and visual parity for their shared brief; and
10. the source reads as an exemplary vanity codebase a serious adopter would enjoy learning from.

Visual polish is a real criterion, but it follows truthful capability, accessibility, and integration evidence. The flagship should feel aspirational because vanity makes the implementation coherent — not because the demo hides bespoke styling outside the system.
