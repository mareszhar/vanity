# vanity — decisions

This register records cross-specification choices and deliberate boundaries. Domain specifications own behavior and examples.

## Recording durable decisions

Record a choice here when it establishes a public contract, serialized format, or documented boundary. The task brief determines the collaboration flow: an agent may decide within its scope, surface a choice for maintainer input, or combine both. When the brief requires maintainer approval, obtain an explicit answer before treating the choice as settled. Never infer approval from a recommendation, silence, or a prior record. If implementation precedes an answer, leave the choice open until it is confirmed or reversed.

## Product and language

| Decision | Why it matters |
| --- | --- |
| Vanity is a design-system engine and TypeScript harness for CSS. | CSS remains the semantic authority; Vanity adds structure, inference, and diagnostics. |
| CSS-owned concepts use CSS names and semantics. Vanity coins names only for concepts CSS does not own. | Readers and tools do not translate between competing dialects. |
| A base term must preserve one transferable inference; qualifiers specialize it by domain, owner, state, role, or representation. | Readers can reuse learned meaning without forcing unrelated concepts into one taxonomy. |
| `$` fences Vanity members only on user-shaped namespaces. | Tokens, axes, and modes keep ordinary names without risking member collisions. |
| Compatible token handles are values wherever their CSS data type is accepted. | Authors never build `var()` adapters by hand. |
| CSS-wide keywords work in every applicable declaration form. | A helper cannot narrow the platform grammar by accident. |
| A CSS-named surface matches CSS grammar and defaults exactly; a Vanity-coined surface may carry defaults, but they are documented, consistent, and policy-configurable. | One rule decides every "should Vanity choose this for you" question, and the answer is predictable from the name alone. |
| A color leaf keeps its authored spelling; only a build-time computation is canonicalized to oklch. | Emitted CSS reads like the CSS that was authored, and folding never substitutes one platform function for another. |
| One CSS concept has one implementation. A free function and a method form share the node, units, requirements, and folding rules. | Two spellings of one idea never disagree about what they emit. |
| A built-in color-scheme axis derives its explicit attribute and runtime control from its mount name; `native.kind: 'scheme'` remains explicit metadata. | Named mounts stay coherent across layers, selectors, runtime state, and native `light-dark()` lowering without inferring behavior from the word `scheme`. |

## System and types

| Decision | Why it matters |
| --- | --- |
| `createSystem()` returns an immutable open system; `consolidate()` returns an immutable locked system. | One system grows additively, then gains resolved styling and runtime capabilities. |
| `add`, `augment`, `overwrite`, and `expect` have distinct contracts. | Names, ownership, and error repair remain explicit. |
| Logical, resolved, restored, and runtime-control handles are contextual interfaces to one semantic subject. | Values, runtime addresses, manifests, and explanations stay connected without claiming one JavaScript object travels across environments. |
| Accumulated types use intersections and simplify at read boundaries. | Large systems retain readable hovers and practical type-checking cost. |
| A package boundary is a read boundary. | Published declarations expose a legible locked surface without builder machinery. |

## Public contract vocabulary

| Decision | Why it matters |
| --- | --- |
| Public portable and runtime type names use the current unsuffixed concept; wire-format discriminators and external protocol versions retain their versions. | A type name describes the API surface while serialized data remains explicit about the format it carries. |
| `value IR` is the canonical name for the portable authored-value intermediate representation. | Protocol, parity, diagnostics, and documentation use one term for the same boundary. |

## Projection and ownership

| Decision | Why it matters |
| --- | --- |
| `consolidate()` is pure and emission-free. | Plain TypeScript, SSR, and tools import system modules without compiler state or I/O. |
| The compiler owns CSS and portable projection. | Build-only closures remain in the in-process contract; browser and SSR modules contain data-only projections. |
| Compatibility, CSS, runtime, and documentation identities are separate. | Each consumer invalidates only for the change that affects it. |
| System CSS and style-module CSS are separate virtual modules. | System CSS deduplicates while component CSS preserves lazy splitting. |
| CSS namespace ownership is stricter than runtime compatibility. | Compatible runtime controllers never mask colliding emitted CSS. |
| Artifacts are atomic, last-good, byte-stable, and write-on-change. | Errors do not publish partial state or create watcher noise. |
| A versioned serialized contract never changes shape under its existing discriminator. | A changed field or semantics takes a new version, so a consumer pinned to a version stays correct. |

## Styling and runtime

| Decision | Why it matters |
| --- | --- |
| Styling inputs are ordered contributions, not deep-merged objects. | Repeated declarations, fallbacks, fragments, and conditions remain lossless. |
| `fragment`, `tdec`, `tdec.propagated`, and `port.dec` produce style data; `class`, `rules`, `raw`, `recipe`, `anatomy`, `atoms`, `keyframes`, and `fontFace` emit styles. | The taxonomy reflects actual output effects rather than call-site similarity. |
| Raw CSS remains an explicit standards form. | Typed support never creates a capability cliff. |
| Conditions are typed AST values; axes declare ordered alternatives. | Selector, at-rule, precedence, locality, and runtime activation stay inspectable. |
| Build-folded derivations are re-resolved wherever their inputs vary — axis modes and scoped substitutions use one primitive. | Build-time derivation stays trustworthy instead of silently going stale under variation. |
| `tdec.propagated` produces declaration data; placement belongs to the caller. | `class`, `rules`, and `raw` remain the only style emitters, and no capability owns a hidden cascade layer. |
| A build surface emits the system's CSS when it is called, not when it is read. | An authoring barrel may alias `ds.class` at module scope without that read being mistaken for styling work. |
| Token emission has base, axis, and case phases. | The cascade advertises only the layers the compiler writes into. |
| CSS `color-mix()` has one shared `colorMix()`/color-value `.mix()` node; its two-item percentage grammar is exact, and its required interpolation space comes from `.in()` or `policies.color.mixSpace`. | Authors see the platform grammar, method and free forms cannot drift, and build folding occurs only where browser equivalence is proven. |
| Mutable tokens and ports solve different lifetimes. | System decisions use runtime token slots; component inputs use component-owned custom properties. |
| Runtime transactions validate before the first write; snapshots use semantic addresses. | Dynamic state stays truthful across SSR, HMR, and schema evolution. |
| Color channel-adjust conveniences are owned by explicit polar namespaces; bare channel forms require `policies.color.adjustSpace`, HWB exposes only `rotate`, and Vanity `alpha` is a color-wide operation distinct from CSS `alpha()` while that grammar is at risk. | The call site states channel semantics, unsupported HWB channels fail in types, and the CSS vocabulary boundary has a documented re-entry condition. |
| Folded polar adjustments use CSS relative-channel units and the canonical number formatter; parsed sRGB alpha uses conventional `rgb()` notation. | Literal and live forms compute the same formula without unit-scale or float-noise drift, while authored gamut remains inspectable. |
| Cross-space channel adjustments fold into unbounded `oklch`/`lch` targets, or into bounded `hsl`/`hwb` targets only when the origin is inside sRGB; out-of-gamut origins remain native relative-color CSS. | Folding never replaces a wider-gamut origin with an out-of-range bounded literal whose computed result could differ from the browser's relative-color resolution. |
| Multi-axis folded derivations record the exact intersection cases their mode product requires, and `derivedCaseGrowth` warns when one token's case count exceeds its advisory budget. | Re-enter when a value-preserving axis-shadowing reduction can be proven against the same cascade and projection evidence. |

## Extensions and tooling

| Decision | Why it matters |
| --- | --- |
| Plugins add or require public system shape through the same immutable chain as applications. | Built-ins and extensions share one ownership model. |
| Hail is the optional opinionated layer. | Core remains CSS-capable without prescribing design taste. |
| Introspection, manifest, diagnostics, audit, DTCG, and CLI derive from one semantic record. | Humans and agents receive one consistent explanation surface. |
| Hover text, completion, TSDoc, and diagnostics are tested API behavior. | The cursor is part of the product, not a secondary presentation. |
| Evidence spans types, emitted CSS, browsers, packages, tooling, and performance. | A green result proves the relevant user-visible behavior. |

## Deliberate boundaries

| Boundary | Re-entry condition |
| --- | --- |
| No runtime CSS-in-JS style graph or component library. | Neither fits Vanity’s CSS-first product boundary. |
| No generic middleware/hooks or emission-transform API. | Re-enter when two real emission-transform consumers cannot use existing extension seams. |
| No whole-system composition API. | Re-enter when plugins and module handoff cannot express a real multi-package compatibility problem. |
| No built-in SVG/Iconify product API. | Re-enter for an external-content consumer with a clear ownership boundary. |
| No explicit runtime stylesheet API beyond declared token slots and mode controls. | Re-enter when a real consumer needs Vanity to own stylesheet mutation outside those browser-native controls. |
| Inline TypeScript style blocks are not part of the Vue contract. | Re-enter when a proposal preserves build-time TypeScript evaluation and justifies its editor/tooling cost without introducing a second styling model. |
| `legibleOn()` is the current accessibility pairing contract; Vanity does not promise native `contrast-color()` behavior for token-backed targets. | Re-enter when `contrast-color()` is interoperable for token-backed targets and provides a strictly better contract. |
| `tdec.propagated` emits unconditional declarations; a substitution whose folded dependents vary by mode is a diagnostic, not nested conditional emission. | Re-enter when a real consumer needs a scoped substitution to carry per-mode arms, and the nested form can be expressed as ordinary style data without a second placement mechanism. |
| The typed color constructor `saturate` uses the CSS-owned spelling shared with the CSS filter function, while `desaturate` remains a Vanity-coined spelling because CSS owns no function with that name. Their color and filter grammars do not collide. | Re-enter the `saturate` boundary when CSS defines a same-position color operation; re-enter `desaturate` if CSS defines that spelling. |
| The typed color constructor `rotate` uses the CSS-owned spelling shared with the CSS transform function; transform and color grammars do not collide. | Re-enter when CSS defines a same-position color operation with this spelling. |
| The portable system format tag is not bumped for a required field addition; a stale artifact is regenerated, not migrated. | Re-enter when a consumer must read a portable artifact it did not generate, or when regeneration is not available at the point of use. |
| CSS-rule payloads crossing the substrate remain opaque `unknown` values, and the CSS backend remains an implementation detail rather than a selectable public surface. | Re-enter this decision if Vanity must inspect or transform a rule payload between authoring and registration, or if a backend replacement is actually underway. |
| Style-module file-scope questions belong to Vanity's CSS authoring context; genuine backend lifecycle stays behind the substrate adapter. | Re-enter this boundary if a caller outside the CSS authoring/compiler boundary needs backend lifecycle behavior or if the adapter no longer provides the required file-scope operations. |
| The manifest schema `$id` is a stable schema identifier, not a retrieval promise; consumers use the exact schema shipped at `@mszr/vanity/manifest.schema.json`. | Re-enter this boundary when the domain and hosting are available to serve the schema at the identifier, when the package schema path changes, or when a consumer requires network-based retrieval. |
