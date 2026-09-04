/**
 * Machine-readable CSS parity ledger.
 *
 * This is the source of truth behind docs/parity-ledger.md. It lives on
 * the explicit `/capabilities` entry point so ordinary styling imports do not
 * ship maintenance metadata.
 */

export type VanityCssSpecMaturity
  = 'recommendation'
    | 'candidate-recommendation'
    | 'working-draft'
    | 'editor-draft'

/** Coverage level recorded for one CSS API in the parity ledger. */
export type VanityCssParityCoverage
  = 'complete'
    | 'typed-subset+raw'
    | 'raw-only'
    | 'planned'

/** Standards source, grammar, lowering, and evidence for one CSS API. */
export interface VanityCssParityRecord {
  readonly id: `CSS-${string}`
  readonly api: string
  readonly cssConcept: string
  readonly spec: {
    readonly module: string
    readonly url: string
    readonly revision: string
    readonly snapshotDate: `${number}-${number}-${number}`
    readonly maturity: VanityCssSpecMaturity
    /** W3C process risk marker, independent from document maturity. */
    readonly risk?: 'at-risk'
  }
  readonly typedGrammar: readonly string[]
  readonly rawGrammar: string
  readonly inputs: readonly string[]
  readonly cssWideKeywords: readonly string[] | 'not-applicable'
  readonly outputType: string
  readonly invalid: readonly string[]
  readonly semantics: 'none' | string
  readonly lowering: string
  readonly fallback: string
  readonly escape: string
  readonly fixtures: readonly string[]
  readonly coverage: VanityCssParityCoverage
  /** Product decision explaining why this coverage level is deliberate. */
  readonly decision?: string
}

const COLOR_5 = Object.freeze({
  module: 'CSS Color Module Level 5',
  url: 'https://drafts.csswg.org/css-color-5/',
  revision: 'Editor’s Draft 20 July 2026',
  snapshotDate: '2026-07-20',
  maturity: 'editor-draft',
} as const)

const VALUES_4 = Object.freeze({
  module: 'CSS Values and Units Module Level 4',
  url: 'https://drafts.csswg.org/css-values-4/',
  revision: 'Editor’s Draft 23 July 2026',
  snapshotDate: '2026-07-23',
  maturity: 'editor-draft',
} as const)

const BACKGROUNDS_3 = Object.freeze({
  module: 'CSS Backgrounds and Borders Module Level 3',
  url: 'https://drafts.csswg.org/css-backgrounds/',
  revision: 'Editor’s Draft 16 December 2025',
  snapshotDate: '2025-12-16',
  maturity: 'editor-draft',
} as const)

const GRID_2 = Object.freeze({
  module: 'CSS Grid Layout Module Level 2',
  url: 'https://www.w3.org/TR/2025/CRD-css-grid-2-20250326/',
  revision: 'W3C Candidate Recommendation Draft 26 March 2025',
  snapshotDate: '2025-03-26',
  maturity: 'candidate-recommendation',
} as const)

const VALUES_5 = Object.freeze({
  module: 'CSS Values and Units Module Level 5',
  url: 'https://drafts.csswg.org/css-values-5/',
  revision: 'Editor’s Draft 23 July 2026',
  snapshotDate: '2026-07-23',
  maturity: 'editor-draft',
} as const)

const FILTERS_1 = Object.freeze({
  module: 'Filter Effects Module Level 1',
  url: 'https://drafts.csswg.org/filter-effects/',
  revision: 'Editor’s Draft 22 July 2026',
  snapshotDate: '2026-07-22',
  maturity: 'editor-draft',
} as const)

const TRANSFORMS_2 = Object.freeze({
  module: 'CSS Transforms Module Level 2',
  url: 'https://drafts.csswg.org/css-transforms-2/',
  revision: 'Editor’s Draft 30 November 2025',
  snapshotDate: '2025-11-30',
  maturity: 'editor-draft',
} as const)

const IMAGES_4 = Object.freeze({
  module: 'CSS Images Module Level 4',
  url: 'https://drafts.csswg.org/css-images-4/',
  revision: 'Editor’s Draft 7 May 2026',
  snapshotDate: '2026-05-07',
  maturity: 'editor-draft',
} as const)

const SHAPES_2 = Object.freeze({
  module: 'CSS Shapes Module Level 2',
  url: 'https://drafts.csswg.org/css-shapes-2/',
  revision: 'Editor’s Draft 6 May 2026',
  snapshotDate: '2026-05-06',
  maturity: 'editor-draft',
} as const)

const ANCHORS_1 = Object.freeze({
  module: 'CSS Anchor Positioning Module Level 1',
  url: 'https://www.w3.org/TR/2026/WD-css-anchor-position-1-20260508/',
  revision: 'W3C Working Draft 8 May 2026',
  snapshotDate: '2026-05-08',
  maturity: 'working-draft',
} as const)

const ENV_1 = Object.freeze({
  module: 'CSS Environment Variables Module Level 1',
  url: 'https://drafts.csswg.org/css-env-1/',
  revision: 'Editor’s Draft 28 May 2026',
  snapshotDate: '2026-05-28',
  maturity: 'editor-draft',
} as const)

const SYNTAX_3 = Object.freeze({
  module: 'CSS Syntax Module Level 3',
  url: 'https://www.w3.org/TR/2021/CRD-css-syntax-3-20211224/',
  revision: 'W3C Candidate Recommendation Draft 24 December 2021',
  snapshotDate: '2021-12-24',
  maturity: 'candidate-recommendation',
} as const)

const CSS_WIDE = Object.freeze(['initial', 'inherit', 'unset', 'revert', 'revert-layer'])

function createColorParityRecord(
  id: `CSS-${string}`,
  api: string,
  cssConcept: string,
  fixture: string,
): VanityCssParityRecord {
  return record({
    id,
    api,
    cssConcept,
    spec: COLOR_5,
    typedGrammar: ['modern space-separated channels', 'none', 'typed calc()/var() channels', 'alpha'],
    rawGrammar: 'all future-valid <color> syntax through rawValue.color()',
    inputs: ['numbers', 'percentages where allowed', 'angles where allowed', 'compatible token handles', 'typed values'],
    cssWideKeywords: 'not-applicable',
    outputType: '<color>',
    invalid: ['incompatible channel data types', 'non-finite numeric channels'],
    semantics: 'none',
    lowering: `${cssConcept} with native CSS channel syntax`,
    fallback: 'fold only when equivalence is proven; otherwise preserve native syntax',
    escape: 'rawValue.color(syntax)',
    fixtures: [fixture, 'src/values/value-law.test-d.ts', 'src/tokens/tokens.module.out.test.ts'],
    coverage: 'typed-subset+raw',
  })
}

function createMathParityRecord(
  id: `CSS-${string}`,
  api: string,
  cssConcept: string,
): VanityCssParityRecord {
  return record({
    id,
    api,
    cssConcept,
    spec: VALUES_4,
    typedGrammar: ['compatible numeric dimensions', 'typed arithmetic', 'token-handle operands'],
    rawGrammar: 'future math grammar through rawValue.<numeric-type>()',
    inputs: ['numbers', 'dimensions', 'percentages', 'compatible token handles', 'typed values'],
    cssWideKeywords: 'not-applicable',
    outputType: 'the consistent CSS numeric type',
    invalid: ['incompatible additive types', 'non-finite numeric inputs', 'division by zero where statically known'],
    semantics: 'none',
    lowering: `${cssConcept} with precedence-preserving expression IR`,
    fallback: 'preserve native math; support-target diagnostics own unsupported typed arithmetic',
    escape: 'rawValue.<numeric-type>(syntax)',
    fixtures: ['src/values/ir.test.ts', 'src/values/ir.test-d.ts', 'src/values/value-law.test-d.ts'],
    coverage: 'typed-subset+raw',
  })
}

/** Standards-parity records keyed by stable CSS IDs: `VANITY_CSS_PARITY_LEDGER['CSS-COLOR-5']`. */
export const VANITY_CSS_PARITY_LEDGER = Object.freeze({
  'CSS-V001': createColorParityRecord('CSS-V001', 'ds.oklch()', 'oklch()', 'src/tokens/tokens.module.out.test.ts'),
  'CSS-V002': createColorParityRecord('CSS-V002', 'ds.rgb()', 'rgb()', 'src/tokens/tokens.module.out.test.ts'),
  'CSS-V003': createColorParityRecord('CSS-V003', 'ds.hsl()', 'hsl()', 'src/tokens/tokens.module.out.test.ts'),
  'CSS-V004': createColorParityRecord('CSS-V004', 'ds.hwb()', 'hwb()', 'src/tokens/tokens.module.out.test.ts'),
  'CSS-V005': createColorParityRecord('CSS-V005', 'ds.lab()', 'lab()', 'src/tokens/tokens.module.out.test.ts'),
  'CSS-V006': createColorParityRecord('CSS-V006', 'ds.lch()', 'lch()', 'src/tokens/tokens.module.out.test.ts'),
  'CSS-V007': createColorParityRecord('CSS-V007', 'ds.oklab()', 'oklab()', 'src/tokens/tokens.module.out.test.ts'),
  'CSS-V008': createColorParityRecord('CSS-V008', 'ds.color()', 'color()', 'src/tokens/tokens.module.out.test.ts'),
  'CSS-V009': record({
    id: 'CSS-V009',
    api: 'ds.colorMix()',
    cssConcept: 'color-mix()',
    spec: COLOR_5,
    typedGrammar: ['one or more colors', 'optional percentages', 'interpolation space', 'polar hue method'],
    rawGrammar: 'all future-valid color-mix() syntax through rawValue.color()',
    inputs: ['colors', 'compatible color token handles', 'percentage values/handles'],
    cssWideKeywords: 'not-applicable',
    outputType: '<color>',
    invalid: ['out-of-range literal percentages', 'hue method on a non-polar space'],
    semantics: 'none',
    lowering: 'native color-mix()',
    fallback: 'preserve native syntax unless a fold is proven',
    escape: 'rawValue.color(syntax)',
    fixtures: ['src/tokens/tokens.module.out.test.ts', 'src/values/value-law.test-d.ts'],
    coverage: 'typed-subset+raw',
  }),
  'CSS-V010': record({
    id: 'CSS-V010',
    api: 'ds.lightDark()',
    cssConcept: 'light-dark()',
    spec: COLOR_5,
    typedGrammar: ['color/color overload', 'image|none image|none overload', 'mixed-form rejection'],
    rawGrammar: 'future-valid color form through rawValue.color(); image form through rawValue.image()',
    inputs: ['colors and color handles', 'typed images', 'none'],
    cssWideKeywords: 'not-applicable',
    outputType: '<color> or <image>, selected by overload',
    invalid: ['mixed color/image forms'],
    semantics: 'none',
    lowering: 'native light-dark() resolved from the consuming element’s used color-scheme',
    fallback: 'support target records native requirement; explicit scheme convenience synchronizes color-scheme',
    escape: 'rawValue.color(syntax) or rawValue.image(syntax)',
    fixtures: ['src/values/value-law.test.ts', 'src/values/value-law.test-d.ts'],
    coverage: 'complete',
  }),
  'CSS-V011': createMathParityRecord('CSS-V011', 'ds.calc()', 'calc()'),
  'CSS-V012': createMathParityRecord('CSS-V012', 'ds.min()', 'min()'),
  'CSS-V013': createMathParityRecord('CSS-V013', 'ds.max()', 'max()'),
  'CSS-V014': createMathParityRecord('CSS-V014', 'ds.clamp()', 'clamp()'),
  'CSS-V015': record({
    id: 'CSS-V015',
    api: 'boxShadow property form',
    cssConcept: 'box-shadow',
    spec: BACKGROUNDS_3,
    typedGrammar: ['none', '<shadow>#', 'CSS-wide keywords'],
    rawGrammar: 'complete property string form',
    inputs: ['strings', 'compatible token handles', 'CSS-wide keywords'],
    cssWideKeywords: CSS_WIDE,
    outputType: 'box-shadow declaration value',
    invalid: ['malformed property grammar'],
    semantics: 'none',
    lowering: 'declaration value unchanged',
    fallback: 'not applicable',
    escape: 'standard property spelling or raw declaration form',
    fixtures: ['src/css/css-keywords.out.test.ts'],
    coverage: 'complete',
  }),
  'CSS-V016': record({
    id: 'CSS-V016',
    api: 'ds.rgb/hsl/hwb/lab/lch/oklab/oklch/color.from()',
    cssConcept: 'relative color syntax',
    spec: COLOR_5,
    typedGrammar: [
      'all eight standard relative-color families',
      'base color and missing-channel inheritance',
      'literal/reference/handle/calc channel replacement',
      'composable channel arithmetic and relative alpha',
    ],
    rawGrammar: 'future relative-color grammar through rawValue.color()',
    inputs: ['colors and color handles', 'numeric/angle values and compatible token handles'],
    cssWideKeywords: 'not-applicable',
    outputType: '<color>',
    invalid: ['incompatible channel types', 'literal division by zero'],
    semantics: 'none',
    lowering: 'the selected color function(from …) when live; exact fold when proven',
    fallback: 'preserve native syntax or proven build fold',
    escape: 'rawValue.color(syntax)',
    fixtures: ['src/tokens/color-relative.test.ts', 'src/tokens/color-relative.test-d.ts'],
    coverage: 'typed-subset+raw',
    decision: 'Typed and discoverable across the entire relative-color family; the raw form preserves future Color 5 grammar.',
  }),
  'CSS-V017': record({
    id: 'CSS-V017',
    api: 'ds.grid.minmax() / ds.grid.repeat()',
    cssConcept: 'minmax() / repeat()',
    spec: GRID_2,
    typedGrammar: ['track fragments', 'repeat count/auto-fill/auto-fit'],
    rawGrammar: 'complete grid property string form',
    inputs: ['strings', 'typed values', 'compatible token handles'],
    cssWideKeywords: 'not-applicable',
    outputType: '<track-list> fragment',
    invalid: ['non-positive literal repeat counts'],
    semantics: 'none',
    lowering: 'native minmax()/repeat()',
    fallback: 'not applicable',
    escape: 'raw property value',
    fixtures: ['src/values/ir.test.ts', 'src/values/value-law.test-d.ts'],
    coverage: 'typed-subset+raw',
  }),
  'CSS-G001': record({
    id: 'CSS-G001',
    api: 'ds.alpha()',
    cssConcept: 'alpha()',
    spec: { ...COLOR_5, risk: 'at-risk' },
    typedGrammar: ['Vanity’s pre-existing alpha replacement helper'],
    rawGrammar: 'CSS alpha() through rawValue.color()',
    inputs: ['color', 'literal alpha amount'],
    cssWideKeywords: 'not-applicable',
    outputType: '<color>',
    invalid: [],
    semantics: 'Current helper lowers through relative oklch; the CSS Color 5 alpha() grammar landed later and requires a dedicated parity migration.',
    lowering: 'oklch(from … / amount)',
    fallback: 'preserve current behavior until the parity migration is designed',
    escape: 'rawValue.color("alpha(…)")',
    fixtures: ['src/tokens/tokens.module.out.test.ts'],
    coverage: 'planned',
    decision: 'Keep Vanity’s established alpha-replacement helper stable; add a separately named CSS alpha() surface only after its at-risk grammar settles.',
  }),
  'CSS-G002': record({
    id: 'CSS-G002',
    api: 'rawValue.color("device-cmyk(…)")',
    cssConcept: 'device-cmyk()',
    spec: { ...COLOR_5, risk: 'at-risk' },
    typedGrammar: [],
    rawGrammar: 'complete device-cmyk() syntax through rawValue.color() and color property strings',
    inputs: ['raw CSS syntax'],
    cssWideKeywords: 'not-applicable',
    outputType: '<color>',
    invalid: ['unbalanced CSS token syntax'],
    semantics: 'none',
    lowering: 'raw syntax preserved',
    fallback: 'the browser owns profile/fallback conversion',
    escape: 'rawValue.color("device-cmyk(…)")',
    fixtures: ['src/values/ir.test.ts'],
    coverage: 'raw-only',
    decision: 'Intentionally raw-only while device-cmyk() remains an at-risk print-specific draft feature.',
  }),
  'CSS-G003': record({
    id: 'CSS-G003',
    api: 'rawValue.<numeric-type>("round/mod/rem(…)")',
    cssConcept: 'stepped value functions',
    spec: VALUES_4,
    typedGrammar: [],
    rawGrammar: 'round(), mod(), and rem() through typed raw numeric forms',
    inputs: ['raw CSS syntax with an explicitly selected numeric result type'],
    cssWideKeywords: 'not-applicable',
    outputType: 'author-selected CSS numeric type',
    invalid: ['unbalanced CSS token syntax'],
    semantics: 'none',
    lowering: 'raw syntax preserved',
    fallback: 'support targets and the browser own availability',
    escape: 'rawValue.<numeric-type>(syntax)',
    fixtures: ['src/values/ir.test.ts'],
    coverage: 'planned',
    decision: 'Planned typed constructors: their dimension-preserving signatures fit Vanity’s value algebra and are broadly useful.',
  }),
  'CSS-G004': record({
    id: 'CSS-G004',
    api: 'rawValue.<numeric-type>("sin/cos/…/pow/sqrt/hypot/log/exp(…)")',
    cssConcept: 'trigonometric and exponential functions',
    spec: VALUES_4,
    typedGrammar: [],
    rawGrammar: 'all Values 4 trigonometric and exponential functions through typed raw numeric forms',
    inputs: ['raw CSS syntax with an explicitly selected numeric result type'],
    cssWideKeywords: 'not-applicable',
    outputType: 'author-selected CSS numeric type',
    invalid: ['unbalanced CSS token syntax'],
    semantics: 'none',
    lowering: 'raw syntax preserved',
    fallback: 'support targets and the browser own availability',
    escape: 'rawValue.<numeric-type>(syntax)',
    fixtures: ['src/values/ir.test.ts'],
    coverage: 'planned',
    decision: 'Planned only after the dimensional algebra and diagnostics are spiked; raw typed values remain the current honest form.',
  }),
  'CSS-G005': record({
    id: 'CSS-G005',
    api: 'rawValue.image() / image-valued property strings',
    cssConcept: 'gradients and image functions',
    spec: IMAGES_4,
    typedGrammar: ['typed <image> carrier', 'light-dark() image overload'],
    rawGrammar: 'gradient and image-function grammars through rawValue.image()',
    inputs: ['raw image syntax', 'typed image values', 'none'],
    cssWideKeywords: 'not-applicable',
    outputType: '<image>',
    invalid: ['unbalanced CSS token syntax'],
    semantics: 'none',
    lowering: 'raw image syntax preserved',
    fallback: 'the consuming property/browser owns image fallback',
    escape: 'rawValue.image(syntax)',
    fixtures: ['src/values/value-law.test.ts'],
    coverage: 'raw-only',
    decision: 'Intentionally raw-only: gradients are an open, punctuation-heavy CSS language where a partial builder would be less delightful than direct CSS.',
  }),
  'CSS-G006': record({
    id: 'CSS-G006',
    api: 'rawValue.transformFunction()/transformList()',
    cssConcept: 'transform functions and lists',
    spec: TRANSFORMS_2,
    typedGrammar: ['typed transform-function and transform-list carriers'],
    rawGrammar: 'complete transform grammar through typed raw forms and property strings',
    inputs: ['raw transform syntax', 'compatible transform handles'],
    cssWideKeywords: CSS_WIDE,
    outputType: '<transform-function> or <transform-list>',
    invalid: ['unbalanced CSS token syntax'],
    semantics: 'none',
    lowering: 'raw transform syntax preserved',
    fallback: 'not applicable',
    escape: 'rawValue.transformFunction/List(syntax)',
    fixtures: ['src/values/ir.test.ts'],
    coverage: 'raw-only',
    decision: 'Intentionally raw-only until a composition API can beat CSS syntax without obscuring order.',
  }),
  'CSS-G007': record({
    id: 'CSS-G007',
    api: 'filter/backdropFilter property strings',
    cssConcept: 'filter functions',
    spec: FILTERS_1,
    typedGrammar: [],
    rawGrammar: 'complete ordered filter-function list through standard property values',
    inputs: ['property strings', 'compatible handles'],
    cssWideKeywords: CSS_WIDE,
    outputType: '<filter-value-list>',
    invalid: ['property parser failures'],
    semantics: 'none',
    lowering: 'property value preserved',
    fallback: 'not applicable',
    escape: 'standard filter/backdropFilter property value',
    fixtures: ['src/css/class-rules.test.ts'],
    coverage: 'raw-only',
    decision: 'Intentionally raw-only; ordered CSS function strings are already compact and lossless.',
  }),
  'CSS-G008': record({
    id: 'CSS-G008',
    api: 'shape/path property strings and rawValue.<type>()',
    cssConcept: 'basic shapes and paths',
    spec: SHAPES_2,
    typedGrammar: [],
    rawGrammar: 'shape(), path(), ray(), and basic-shape grammar through standard-property/raw forms',
    inputs: ['raw CSS syntax'],
    cssWideKeywords: CSS_WIDE,
    outputType: '<basic-shape>, <path>, or the consuming property grammar',
    invalid: ['property parser failures', 'unbalanced CSS token syntax'],
    semantics: 'none',
    lowering: 'raw syntax preserved',
    fallback: 'not applicable',
    escape: 'standard property value or rawValue.unknown(syntax)',
    fixtures: ['src/values/ir.test.ts'],
    coverage: 'raw-only',
    decision: 'Intentionally raw-only because path and shape grammars are open DSLs with no useful partial structural model yet.',
  }),
  'CSS-G009': record({
    id: 'CSS-G009',
    api: 'rawValue.<type>("attr(…)")',
    cssConcept: 'attr()',
    spec: VALUES_5,
    typedGrammar: [],
    rawGrammar: 'complete attr() grammar through an explicitly typed raw value form',
    inputs: ['attribute name/type/fallback syntax'],
    cssWideKeywords: 'not-applicable',
    outputType: 'author-selected CSS data type',
    invalid: ['unbalanced CSS token syntax'],
    semantics: 'none',
    lowering: 'raw syntax preserved',
    fallback: 'native attr() fallback and invalid-at-computed-value behavior',
    escape: 'rawValue.<type>("attr(…)")',
    fixtures: ['src/values/ir.test.ts'],
    coverage: 'planned',
    decision: 'Planned typed helper because attribute type and fallback can project an exact Vanity data type and improve diagnostics.',
  }),
  'CSS-G010': record({
    id: 'CSS-G010',
    api: 'rawValue.<type>("env(…)")',
    cssConcept: 'env()',
    spec: ENV_1,
    typedGrammar: [],
    rawGrammar: 'complete env() grammar through an explicitly typed raw value form',
    inputs: ['environment variable name', 'optional indices and fallback'],
    cssWideKeywords: 'not-applicable',
    outputType: 'author-selected CSS data type',
    invalid: ['unbalanced CSS token syntax'],
    semantics: 'none',
    lowering: 'raw syntax preserved',
    fallback: 'native env() fallback and invalid-at-computed-value behavior',
    escape: 'rawValue.<type>("env(…)")',
    fixtures: ['src/values/ir.test.ts'],
    coverage: 'planned',
    decision: 'Planned typed helper for known UA variables plus an open-name overload; the raw form remains canonical for future variables.',
  }),
  'CSS-G011': record({
    id: 'CSS-G011',
    api: 'rawValue.length()/property strings for anchor(), anchor-size(), and position-*',
    cssConcept: 'anchor positioning',
    spec: ANCHORS_1,
    typedGrammar: [],
    rawGrammar: 'complete anchor function/property grammar through typed raw values and standard properties',
    inputs: ['anchor names', 'sides/sizes', 'fallbacks', 'position property values'],
    cssWideKeywords: CSS_WIDE,
    outputType: '<length-percentage> or consuming property grammar',
    invalid: ['property parser failures', 'unbalanced CSS token syntax'],
    semantics: 'none',
    lowering: 'raw syntax preserved',
    fallback: 'support targets and the browser own availability',
    escape: 'rawValue.length(syntax) and standard position properties',
    fixtures: ['src/values/ir.test.ts'],
    coverage: 'planned',
    decision: 'Planned after an isolated inference spike; the Working Draft is still changing and the current typed raw form is lossless.',
  }),
  'CSS-G012': record({
    id: 'CSS-G012',
    api: 'ds.fontFace()/keyframes() plus ds.raw()',
    cssConcept: 'descriptor at-rules',
    spec: SYNTAX_3,
    typedGrammar: ['@font-face descriptors', '@keyframes steps'],
    rawGrammar: 'remaining ordered descriptor at-rules through ds.raw()',
    inputs: ['typed font/keyframe records', 'raw CSS for @page, @counter-style, @font-feature-values, and future rules'],
    cssWideKeywords: 'not-applicable',
    outputType: 'at-rule IR/CSS',
    invalid: ['malformed CSS', 'conditions where the typed rule forbids them'],
    semantics: 'none',
    lowering: 'lossless ordered rule IR',
    fallback: 'not applicable',
    escape: 'ds.raw(css)',
    fixtures: ['src/css/class-rules.test.ts', 'src/css/css.out.test.ts'],
    coverage: 'typed-subset+raw',
    decision: 'Typed subset plus raw: only high-frequency descriptor rules earn dedicated APIs; the ordered raw form prevents lossy map models.',
  }),
} satisfies Record<string, VanityCssParityRecord>)

/**
 * Every public CSS-owned spelling that CI requires to have a ledger row.
 * Higher-level/coined helpers such as `legibleOn()` are intentionally absent.
 */
export const VANITY_CSS_NAMED_API_ROWS = Object.freeze({
  alpha: 'CSS-G001',
  calc: 'CSS-V011',
  clamp: 'CSS-V014',
  color: 'CSS-V008',
  colorMix: 'CSS-V009',
  gridMinmaxRepeat: 'CSS-V017',
  hsl: 'CSS-V003',
  hwb: 'CSS-V004',
  lab: 'CSS-V005',
  lch: 'CSS-V006',
  lightDark: 'CSS-V010',
  max: 'CSS-V013',
  min: 'CSS-V012',
  oklab: 'CSS-V007',
  oklch: 'CSS-V001',
  relativeColor: 'CSS-V016',
  rgb: 'CSS-V002',
} as const)

function record(input: VanityCssParityRecord): VanityCssParityRecord {
  return Object.freeze({
    ...input,
    spec: Object.freeze({ ...input.spec }),
    typedGrammar: Object.freeze([...input.typedGrammar]),
    inputs: Object.freeze([...input.inputs]),
    cssWideKeywords: input.cssWideKeywords === 'not-applicable'
      ? input.cssWideKeywords
      : Object.freeze([...input.cssWideKeywords]),
    invalid: Object.freeze([...input.invalid]),
    fixtures: Object.freeze([...input.fixtures]),
  })
}
