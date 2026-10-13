# Can review reach live decisions and authored values without a DevTools host?

A review needs a page, declaration provenance and a reliable route back to an authored value. This experiment measures the host and browser seams before the production decision graph depends on them. Its models use local fixtures and never import the SDK.

**Current result:** host-free mounting, optional Kit registration, ordered CSSOM replay and conservative source spans are reproducible local models. Wrapped vertical text is measurable within one physical pixel in the observed font fixtures; ragged cross-axis text stays estimated. The calibration reports coverage beside errors, including a known false positive. These are substrate results, not integrated SDK guarantees.

| Question | Observed result | Limit |
| --- | --- | --- |
| Host-free mounting and pushed replies | Vite 6.4.4, 7.3.7 and 8.3.4; Nuxt 4.6.0; hidden shadow root, explicit open, keyboard and push | Local host model, not the SDK overlay |
| Optional Kit | Kit 0.7.6 command and dock; one registration per client host | Nuxt invokes setup for its client and SSR hosts; SSR registration is skipped |
| Production presence | Six Vite major/Kit cells have byte-identical production output with and without the model; Nuxt compares all production artifacts with controlled timestamps and unordered host lookup maps | Nuxt comparison is not a raw byte guarantee; SDK integration follows separately |
| CSSOM preview | Classes, recipes, anatomy parts and active conditions affect both matching instances; unrelated element unchanged; restoration holds | Requires exact emitted-arm identification |
| Overlapping declarations | Direct shorthand mutation overwrites a separate longhand; replaying ordered declarations preserves it | Ordered replay must use the graph, not reverse engineer merged CSSOM declarations |
| Concurrent previews | Priority, local custom-property values, separate resets and exact restoration hold | Prototype graph; producer integration follows separately |
| Seen geometry | Arial ghost rows: box 4 / seen 20; resting surface: seen 4; hover activation changes seen 20 to 4 | Leading matters; the 20 example uses 16px Arial / 12px line height |
| Font precision | 36 font/DPR fixtures: 33 exact raster matches, 3 Georgia cases differ by one physical pixel | Audit rounding must include this uncertainty |
| Audit calibration | 13 labeled fixtures, 7 evaluated / 6 skipped, zero FP/FN; two demos, 11 evaluated / 1 skipped, one FP / zero FN | Wrapped card title/body/footer relation is a known false positive; transform remains skipped |
| Source spans | Oxc ranges preserve Unicode, CRLF and TypeScript wrappers; direct references, interpolation and calculations have exact ranges | Helper-built values and spreads are non-editable; production uses its existing instrumentation walk |

Clipped, transformed, absolutely positioned, image and decorative pseudo-element shapes have conservative estimated readings and do not generate default flags. Hover-only surfaces are reported through authored condition metadata. The local span model is deliberately conservative; it does not establish production alias or ownership handling.

An authored contribution array can retain two inspection candidates while emitting only its final winning declaration. The producer must connect that winner to its original span; an overwritten candidate is not a preview target. Distinct classes in the observed fixture retain separate CSSOM rules.

## Reproduction

Install with `pnpm install --frozen-lockfile`, then run `pnpm --filter spike-review-decision-reach check` and `pnpm --filter spike-review-decision-reach test`. The runners create disposable fixture copies and local result files. Results and fixture build logs live under ignored `test-results/`. They require the pinned Playwright Chromium installation. Host aliases isolate Vite 6.4.4 and 7.3.7 from the reference Vite 8.3.1; the review fixture uses Vite 8.3.4. The named `nuxt46` catalog isolates Nuxt 4.6.0 and its Vite/PostCSS requirements from the workspace reference 4.5.2.

The three-day release-age policy admits Nuxt 4.6.0. Nuxt 4.6.1 was published on October 9 at 22:59 UTC and becomes eligible on October 12 at 22:59 UTC. Thirty exact cssnano-family versions have reviewed trust-policy exceptions: registry metadata reports trusted publishing, provenance identifies cssnano's publish workflow on main, and its artifact digest agrees with registry integrity. Those exceptions end when cssnano restores maintainer approval or Nuxt moves away from cssnano 9; a different version remains checked.

## Calibration coverage

| Corpus | Candidate relations | Evaluated | Skipped and reasons | Expected positives | False positives | False negatives |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| Nuxt demo | 9 | 8 | 1 transform | 1 | 0 | 0 |
| Vite comparison demo, Vanity lane | 3 | 3 | 0 | 1 | 1 | 0 |
| Hand-labeled fixtures | 13 | 7 | 1 each: conditional surface, decorative pseudo-element, divider, absolute position, transform, image | 3 | 0 | 0 |

The demos use temporary copies of maintained sources. Section heads compare their internal seen gaps with the gap to following content. The card relation compares title-to-body with body-to-footer: 19px inside and 12.15625px outside in a healthy card produces a false inversion flag. It remains in the results; no threshold was tuned to remove it. The earlier candidate list mixed group relations and measurement exclusions, so this expanded calibration makes the wrapped card's relation explicit. It is narrow calibration, including controlled mutations, rather than a claim of exhaustive layout correctness.

Measurements use the first line's cap top and last line's baseline for vertical wrapped text. Six wrapped font/DPR fixtures stay within one physical pixel of raster ink; the wider 36-fixture font corpus has 33 exact matches and three Georgia/DPR-1 differences of one physical pixel. Audit rounding includes at least one physical pixel. A skip is not a pass. The prototype measures vertical extents; horizontal geometry breadth and other scripts are not established here.

The local graph requires ordered emitted declarations for replay. Source ranges require the winning emitted declaration rather than every authored candidate. The production decision graph supplies those fields separately; the model does not infer their identity from equal CSS values. The experiment does not decide whether the overlay ships; that remains the feedback-loop evaluation.

The installed Nuxt pipeline declares an optional Kit peer range of `^0.4.1`; the observed registration uses Kit 0.7.6. Its two-host registration behavior is proved by the fixture, rather than by that older peer declaration. The transitive browserslist updater also declares 4.29.2 while 4.29.3 is installed. Neither warning is hidden or treated as a compatibility proof.

Nuxt production comparison fixes generated public-asset timestamps in the disposable fixture at `nitro:build:public-assets`. Nitro’s asset table and Nuxt’s style lookup tables are filled concurrently, so the comparison sorts only those generated object entries, retaining their complete values and every other byte. Raw differences are saved beside the comparison; CSS, application JavaScript and all other files are compared byte for byte. Repeated unchanged-host builds also varied those lookup orders. The fixture control does not change the workspace’s scripts or application builds.
