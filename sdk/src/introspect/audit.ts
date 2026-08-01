/**
 * Audits ([spec-introspection.md §3]): the build knows enough to flag
 * drift lint can't see. Each finding is a warning with a fix-it — never a
 * hard gate unless the system promoted it (`createSystem({ audit })`), and
 * never moralizing: a lane only speaks where the system's own data shows a
 * convention exists to stray from.
 */

import type { VanityAuditConfig, VanityAuditKind, VanityAuditLevel } from '../internal/inspect'
import type { VanityOklch } from '../tokens/math'
import type { VanityManifest, VanityManifestContrast, VanityManifestEscape, VanityManifestStyle } from './manifest'
import { parseBlocks, walkDeclarations } from '../internal/cssBlocks'
import { parseColor } from '../tokens/math'
import { manifestModules, manifestTokenUsage } from './manifest'

export type { VanityAuditConfig, VanityAuditKind, VanityAuditLevel }

export interface VanityAuditFinding {
  kind: VanityAuditKind
  level: 'warn' | 'error'
  /** The headline: what drifted, naming the value and the token it should be. */
  message: string
  fix?: string
  /** The style module the finding points into, root-relative. */
  file?: string
}

export interface VanityAuditEvidence {
  readonly eagerStyleBarrels?: readonly { readonly file: string, readonly imports: readonly string[] }[]
  readonly cssParityGaps?: readonly { readonly capability: string, readonly expected: string, readonly actual: string, readonly file?: string }[]
  readonly staleArtifacts?: readonly { readonly artifact: string, readonly expected: string, readonly actual: string, readonly file?: string }[]
  readonly rootModeDisagreements?: readonly {
    readonly axis: string
    readonly readings: readonly { readonly root: string, readonly mode?: string }[]
  }[]
}

/** Two colors this close in OKLab read as the same color — the ΔE epsilon. */
const NEAR_DUPLICATE_EPSILON = 0.02

/** A lane speaks only when tokens already carry it: at least this many tokenized declarations… */
const STRAY_MIN_TOKENIZED = 2

// ─── The audit ───────────────────────────────────────────────────────────────

/**
 * Run every audit over a built manifest and its emitted CSS. Promotion comes
 * from the manifest (the system's own `audit` option), overridable per call;
 * `'off'` silences a lane, `'error'` makes its findings hard-gate material.
 */
export function audit(
  manifest: VanityManifest,
  css: string,
  config?: VanityAuditConfig,
  evidence: VanityAuditEvidence = {},
): VanityAuditFinding[] {
  const levels: Record<VanityAuditKind, VanityAuditLevel> = {
    unusedTokens: 'warn',
    nearDuplicates: 'warn',
    contrast: 'warn',
    escapes: 'warn',
    scaleStrays: 'warn',
    focusVisibility: 'warn',
    specificityContexts: 'warn',
    rawAssertions: 'warn',
    nonportableValues: 'warn',
    ambiguousAxes: 'warn',
    mutableRootHazards: 'warn',
    aliasEscapes: 'warn',
    overwriteInventory: 'warn',
    eagerStyleBarrels: 'warn',
    cssParityGaps: 'warn',
    staleArtifacts: 'warn',
    rootModeDisagreements: 'warn',
    ...Object.fromEntries(Object.entries(manifest.system.audits).map(([name, entry]) => [name, entry.level])),
    ...config,
  }

  const findings: VanityAuditFinding[] = []
  const declarations = collectDeclarations(css)

  const lanes: Record<VanityAuditKind, () => VanityAuditFinding[]> = {
    unusedTokens: () => unusedTokens(manifest),
    nearDuplicates: () => nearDuplicates(manifest, declarations),
    contrast: () => acceptedContrast(manifest),
    escapes: () => escapes(manifest),
    scaleStrays: () => scaleStrays(manifest, declarations),
    focusVisibility: () => focusVisibility(manifest, declarations),
    specificityContexts: () => specificityContexts(manifest),
    rawAssertions: () => rawAssertions(manifest),
    nonportableValues: () => nonportableValues(manifest),
    ambiguousAxes: () => ambiguousAxes(manifest),
    mutableRootHazards: () => mutableRootHazards(manifest),
    aliasEscapes: () => aliasEscapes(manifest),
    overwriteInventory: () => overwriteInventory(manifest),
    eagerStyleBarrels: () => (evidence.eagerStyleBarrels ?? []).map(entry => ({
      kind: 'eagerStyleBarrels' as const,
      level: 'warn' as const,
      message: `${entry.file} eagerly imports ${entry.imports.length} style module${entry.imports.length === 1 ? '' : 's'}`,
      fix: 'import component style modules at their consumption boundary so unrelated CSS can stay out of the graph',
      file: entry.file,
    })),
    cssParityGaps: () => (evidence.cssParityGaps ?? []).map(entry => ({
      kind: 'cssParityGaps' as const,
      level: 'warn' as const,
      message: `${entry.capability} differs between expected CSS '${entry.expected}' and emitted CSS '${entry.actual}'`,
      fix: 'repair the lowering or update the capability ledger with an explicit, tested difference',
      ...(entry.file === undefined ? {} : { file: entry.file }),
    })),
    staleArtifacts: () => (evidence.staleArtifacts ?? []).map(entry => ({
      kind: 'staleArtifacts' as const,
      level: 'warn' as const,
      message: `${entry.artifact} carries '${entry.actual}' but the source expects '${entry.expected}'`,
      fix: 'regenerate the portable artifact from the current source system',
      ...(entry.file === undefined ? {} : { file: entry.file }),
    })),
    rootModeDisagreements: () => (evidence.rootModeDisagreements ?? []).map(entry => ({
      kind: 'rootModeDisagreements' as const,
      level: 'warn' as const,
      message: `${entry.axis} disagrees across roots: ${entry.readings.map(reading => `${reading.root}=${reading.mode ?? 'unknown'}`).join(', ')}`,
      fix: 'activate the same mode on every bound root or scope the runtime operation to one root',
    })),
  }

  for (const [kind, run] of Object.entries(lanes) as Array<[VanityAuditKind, () => VanityAuditFinding[]]>) {
    if (levels[kind] === 'off')
      continue

    findings.push(...run().map(finding => ({ ...finding, level: levels[kind] as 'warn' | 'error' })))
  }

  return findings
}

interface Declaration {
  selector: string
  property: string
  value: string
}

/** Every emitted declaration outside `:root` — the token graph audits itself elsewhere. */
function collectDeclarations(css: string): Declaration[] {
  const declarations: Declaration[] = []

  walkDeclarations(parseBlocks(css), (selector, property, value) => {
    if (selector.includes(':root') || property.startsWith('--'))
      return

    declarations.push({ selector, property, value })
  })

  return declarations
}

// ─── Unused tokens ───────────────────────────────────────────────────────────

/**
 * Defined, never referenced — not in the CSS, and not (transitively) feeding
 * a token that is. Deprecated tokens are already on their way out.
 */
function unusedTokens(manifest: VanityManifest): VanityAuditFinding[] {
  const usage = manifestTokenUsage(manifest)
  const used = new Set<string>()
  const queue = Object.entries(manifest.system.tokens)
    .filter(([path]) => (usage[path] ?? 0) > 0)
    .map(([path]) => path)

  while (queue.length > 0) {
    const path = queue.pop()!

    if (used.has(path))
      continue

    used.add(path)
    queue.push(...(manifest.system.tokens[path]?.dependencies.flatMap(edge => edge.path ?? []) ?? []))
  }

  return Object.entries(manifest.system.tokens)
    .filter(([path, token]) => !used.has(path) && token.deprecated === undefined)
    .map(([path, token]) => ({
      kind: 'unusedTokens' as const,
      level: 'warn' as const,
      message: `${path} is defined but nothing references it`,
      fix: `delete it, or mark it .deprecated('…') while consumers migrate`,
      ...(token.declaredAt?.file === undefined ? {} : { file: token.declaredAt.file }),
    }))
}

// ─── Near-duplicate values ───────────────────────────────────────────────────

const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)/gi

/**
 * Parse only what is unmistakably a color. The color library is lenient —
 * `'9999'` reads as bare hex — so plain numbers and lengths must never enter
 * the color lanes.
 */
function parseColorish(value: string): VanityOklch | undefined {
  if (value.startsWith('#') || /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i.test(value))
    return parseColor(value)

  // A bare word can be a named color — 'rebeccapurple' parses, 'auto' doesn't.
  if (/^[a-z]+$/i.test(value))
    return parseColor(value)

  return undefined
}

/** A raw color within a perceptual epsilon of an existing token — suggest the token. */
function nearDuplicates(manifest: VanityManifest, declarations: Declaration[]): VanityAuditFinding[] {
  const tokens = Object.entries(manifest.system.tokens)
    .map(([path, token]) => ({ path, color: parseColorish(token.preview.status === 'resolved' ? token.preview.val : '') }))
    .filter((entry): entry is { path: string, color: VanityOklch } => entry.color !== undefined)

  if (tokens.length === 0)
    return []

  const sightings = new Map<string, number>()

  for (const { value } of declarations) {
    // A value that rides `var()` already came from a token.
    if (value.includes('var('))
      continue

    for (const literal of value.match(COLOR_LITERAL) ?? [])
      sightings.set(literal, (sightings.get(literal) ?? 0) + 1)
  }

  const findings: VanityAuditFinding[] = []

  for (const [literal, count] of sightings) {
    const color = parseColor(literal)

    if (color === undefined)
      continue

    const twin = tokens.find(token => deltaOk(color, token.color) < NEAR_DUPLICATE_EPSILON)

    if (twin === undefined)
      continue

    findings.push({
      kind: 'nearDuplicates',
      level: 'warn',
      message: `'${literal}' appears ${count === 1 ? 'once' : `${count}×`} as a raw value — t.${twin.path} is visually the same color`,
      fix: `use t.${twin.path}`,
    })
  }

  return findings
}

/** Perceptual distance in OKLab; alpha differences disqualify the match. */
function deltaOk(a: VanityOklch, b: VanityOklch): number {
  if (Math.abs((a.alpha ?? 1) - (b.alpha ?? 1)) > 0.01)
    return Number.POSITIVE_INFINITY

  const [aa, ab] = labAxes(a)
  const [ba, bb] = labAxes(b)
  return Math.hypot(a.l - b.l, aa - ba, ab - bb)
}

function labAxes({ c, h }: VanityOklch): [number, number] {
  const radians = ((h ?? 0) * Math.PI) / 180
  return [c * Math.cos(radians), c * Math.sin(radians)]
}

// ─── Contrast acceptances ────────────────────────────────────────────────────

/** The consciously-accepted thresholds, surfaced so acceptance stays a decision. */
function acceptedContrast(manifest: VanityManifest): VanityAuditFinding[] {
  return manifestContrast(manifest)
    .filter(entry => entry.accepted)
    .map(entry => ({
      kind: 'contrast' as const,
      level: 'warn' as const,
      message: `${entry.pairing} accepts ${describeLevel(entry)} — measured ${entry.measured} (${entry.scheme})`,
      fix: 'raise the target contrast to retire the acceptance',
      ...(entry.declaredAt?.file === undefined ? {} : { file: entry.declaredAt.file }),
    }))
}

function describeLevel(entry: VanityManifestContrast): string {
  return entry.algorithm === 'apca' ? `APCA Lc ${entry.min}` : `WCAG 2 ${entry.min}:1`
}

// ─── The escape inventory ────────────────────────────────────────────────────

/** Exceptional CSS made findable, reviewable, removable ([patterns.md §8]). */
function escapes(manifest: VanityManifest): VanityAuditFinding[] {
  const findings: VanityAuditFinding[] = []

  for (const escape of manifestEscapes(manifest)) {
    const location = escape.declaredAt?.file === undefined ? {} : { file: escape.declaredAt.file }

    switch (escape.form) {
      case 'raw':
      case 'css.raw':
        findings.push({
          kind: 'escapes',
          level: 'warn',
          message: `${escape.form} block — ${escape.detail}`,
          ...location,
        })
        break
      case 'class.standard':
      case 'css.standard':
        break
      case 'unsafe':
        findings.push({
          kind: 'escapes',
          level: 'warn',
          message: `unsafe.value ${escape.detail} — '${escape.reason}'`,
          ...location,
        })
        break
      case 'overrides':
        findings.push({
          kind: 'escapes',
          level: 'warn',
          message: `overrides-layer style: ${escape.detail}`,
          ...location,
        })
        break
      case 'rules':
      case 'globalCss':
        if (escape.layer === 'overrides') {
          findings.push({
            kind: 'escapes',
            level: 'warn',
            message: `overrides-layer ${escape.form}: '${escape.detail}'`,
            ...location,
          })
        }
        else if (targetsForeignDom(escape.detail)) {
          findings.push({
            kind: 'escapes',
            level: 'warn',
            message: `${escape.form} targets DOM it doesn't own: '${escape.detail}'`,
            ...location,
          })
        }
        break
    }
  }

  return findings
}

/**
 * A global selector naming a class or id reaches into markup some other code
 * renders — third-party targeting. Element and `:root`-ish selectors are
 * ordinary global styling (resets, typography) and stay out of the inventory.
 */
function targetsForeignDom(selector: string): boolean {
  return /[.#][a-z_-]/i.test(selector)
}

// ─── Scale strays ────────────────────────────────────────────────────────────

/**
 * A literal value for a property the system already styles through tokens —
 * z-index anarchy, the odd hard-coded padding. Data-driven: a property lane
 * only speaks when tokenized declarations dominate it, so a system that never
 * tokenized a property is never lectured about it.
 */
function scaleStrays(manifest: VanityManifest, declarations: Declaration[]): VanityAuditFinding[] {
  const lanes = new Map<string, { tokenized: number, strays: Declaration[] }>()
  const graphVars = new Set(Object.values(manifest.system.tokens).flatMap(token => token.name ?? []))

  for (const declaration of declarations) {
    const lane = lanes.get(declaration.property) ?? { tokenized: 0, strays: [] }

    if (referencesGraph(declaration.value, graphVars))
      lane.tokenized++
    else if (!universalValue(declaration.value) && parseColorish(declaration.value) === undefined)
      lane.strays.push(declaration) // colors are the duplicates lane's business

    lanes.set(declaration.property, lane)
  }

  const findings: VanityAuditFinding[] = []

  for (const [property, lane] of lanes) {
    if (lane.tokenized < STRAY_MIN_TOKENIZED || lane.strays.length >= lane.tokenized)
      continue

    for (const stray of lane.strays) {
      findings.push({
        kind: 'scaleStrays',
        level: 'warn',
        message: `${property}: ${stray.value} (${stray.selector}) — ${lane.tokenized} other ${property} declaration${lane.tokenized === 1 ? '' : 's'} ride the tokens`,
        fix: 'reference the token it means, or add the value to the scale',
      })
    }
  }

  return findings
}

/** Values no scale claims — flagging `padding: 0` would be moralizing, not auditing. */
function universalValue(value: string): boolean {
  return /^(?:0|inherit|initial|unset|revert|revert-layer|none|auto|normal|currentcolor|transparent)$/i.test(value)
}

function referencesGraph(value: string, graphVars: Set<string>): boolean {
  for (const name of graphVars) {
    if (value.includes(`var(${name})`) || value.includes(`var(${name},`))
      return true
  }

  return false
}

// ─── Focus visibility ───────────────────────────────────────────────────────

/** Removing the native ring is safe only when the same subject replaces it. */
function focusVisibility(manifest: VanityManifest, declarations: Declaration[]): VanityAuditFinding[] {
  const removals = new Map<string, Declaration>()
  const replacements = new Set<string>()

  for (const declaration of declarations) {
    for (const subject of focusSubjects(declaration.selector)) {
      if (removesOutline(declaration))
        removals.set(subject, declaration)

      if (declaration.selector.includes(':focus-visible') && suppliesOutline(declaration))
        replacements.add(subject)
    }
  }

  return [...removals]
    .filter(([subject]) => !replacements.has(subject))
    .map(([subject]) => {
      const className = subject.startsWith('.') ? subject.slice(1) : undefined
      const source = className === undefined ? undefined : manifestStyles(manifest)[className]

      return {
        kind: 'focusVisibility' as const,
        level: 'warn' as const,
        message: `${subject} removes its focus outline without a :focus-visible replacement`,
        fix: 'spread focusRing(), or add an equally visible focusVisible rule',
        ...(source?.declaredAt?.file === undefined ? {} : { file: source.declaredAt.file }),
      }
    })
}

function focusSubjects(selector: string): string[] {
  const classes = [...selector.matchAll(/\.([_a-z][\w-]*)/gi)].map(match => `.${match[1]}`)

  if (classes.length > 0)
    return [...new Set(classes)]

  return selector.split(',')
    .map(part => part.trim().match(/^[a-z][\w-]*/i)?.[0])
    .filter((subject): subject is string => subject !== undefined)
}

function removesOutline({ property, value }: Declaration): boolean {
  return (property === 'outline' && /^(?:none|0(?:px|rem|em)?)$/i.test(value.trim()))
    || (property === 'outline-width' && /^0(?:px|rem|em)?$/i.test(value.trim()))
}

function suppliesOutline({ property, value }: Declaration): boolean {
  return (property === 'outline' && !/^(?:none|0(?:px|rem|em)?)$/i.test(value.trim()))
    || (property === 'outline-width' && !/^0(?:px|rem|em)?$/i.test(value.trim()))
}

// ─── Semantic/provenance lanes ─────────────────────────────────────────────

function specificityContexts(manifest: VanityManifest): VanityAuditFinding[] {
  const findings: VanityAuditFinding[] = []
  const seen = new Set<string>()
  for (const [path, token] of Object.entries(manifest.system.tokens)) {
    for (const declaration of token.declarations) {
      const selectors = declaration.context.selectors.length === 0
        ? [declaration.context.root]
        : declaration.context.selectors
      for (const selector of selectors) {
        const ids = (selector.match(/#[\w-]+/g) ?? []).length
        const key = `${path}\0${selector}`
        if (ids < 2 || seen.has(key))
          continue
        seen.add(key)
        findings.push({
          kind: 'specificityContexts',
          level: 'warn',
          message: `${path} emits into '${selector}', whose ${ids} id selectors make ordinary override contexts difficult`,
          fix: 'lower the token root/condition specificity, usually with one stable root or :where()',
          ...(token.declaredAt?.file === undefined ? {} : { file: token.declaredAt.file }),
        })
      }
    }
  }
  return findings
}

function rawAssertions(manifest: VanityManifest): VanityAuditFinding[] {
  return manifestEscapes(manifest)
    .filter(escape => escape.form === 'raw' || escape.form === 'css.raw' || escape.form === 'unsafe')
    .map(escape => ({
      kind: 'rawAssertions' as const,
      level: 'warn' as const,
      message: `${escape.form} bypasses one or more typed CSS assertions — ${escape.detail}`,
      fix: 'prefer a typed value/helper when one can express the same platform syntax',
      ...(escape.declaredAt?.file === undefined ? {} : { file: escape.declaredAt.file }),
    }))
}

function nonportableValues(manifest: VanityManifest): VanityAuditFinding[] {
  return Object.entries(manifest.system.tokens)
    .filter(([, token]) => token.portability.status === 'nonportable')
    .map(([path, token]) => ({
      kind: 'nonportableValues' as const,
      level: 'warn' as const,
      message: `${path} cannot round-trip through authored DTCG: ${token.portability.reason ?? 'nonportable expression'}`,
      fix: 'lower the value to core IR or install a plugin DTCG codec',
      ...(token.declaredAt?.file === undefined ? {} : { file: token.declaredAt.file }),
    }))
}

function ambiguousAxes(manifest: VanityManifest): VanityAuditFinding[] {
  const findings: VanityAuditFinding[] = []
  for (const [axis, definition] of Object.entries(manifest.system.axes)) {
    for (const [mode, configured] of Object.entries(definition.modes)) {
      const seen = new Map<string, string>()
      for (const arm of configured.arms) {
        const key = `${arm.mechanism}:${arm.priority}:${arm.locality}`
        const prior = seen.get(key)
        if (prior !== undefined && prior !== arm.when) {
          findings.push({
            kind: 'ambiguousAxes',
            level: 'warn',
            message: `${axis}.${mode} has equally-ranked ${arm.mechanism} arms ('${prior}' and '${arm.when}')`,
            fix: 'give fallback/explicit arms distinct priorities or collapse equivalent conditions',
          })
        }
        seen.set(key, arm.when)
      }
    }
  }
  return findings
}

function mutableRootHazards(manifest: VanityManifest): VanityAuditFinding[] {
  const findings: VanityAuditFinding[] = []
  for (const [path, token] of Object.entries(manifest.system.tokens)) {
    if (!token.mutable || token.runtime === undefined)
      continue
    const roots = new Set(token.declarations.flatMap(declaration => [
      declaration.context.root,
      ...declaration.context.selectors,
    ]))
    for (const root of roots) {
      if (manifest.system.root === undefined || root === manifest.system.root || root.includes(manifest.system.root))
        continue
      findings.push({
        kind: 'mutableRootHazards',
        level: 'warn',
        message: `${path} has a mutable binding at '${root}', outside system root '${manifest.system.root}'`,
        fix: 'bind the runtime at or above every trigger substitution point, or keep mutable conditions under the token root',
        ...(token.declaredAt?.file === undefined ? {} : { file: token.declaredAt.file }),
      })
    }
  }
  return findings
}

function aliasEscapes(manifest: VanityManifest): VanityAuditFinding[] {
  return manifestEscapes(manifest)
    .filter(escape => escape.form === 'class.standard' || escape.form === 'css.standard')
    .map(escape => ({
      kind: 'aliasEscapes' as const,
      level: 'warn' as const,
      message: `${escape.form} bypasses the configured aliases-only vocabulary — ${escape.detail}`,
      fix: 'use the configured alias when this is not an intentional platform-spelling escape',
      ...(escape.declaredAt?.file === undefined ? {} : { file: escape.declaredAt.file }),
    }))
}

function overwriteInventory(manifest: VanityManifest): VanityAuditFinding[] {
  return manifest.system.overwrites.map(entry => ({
    kind: 'overwriteInventory',
    level: 'warn',
    message: `${entry.operation} ${entry.target}: ${entry.paths.join(', ') || '(whole contribution)'}`,
    fix: entry.operation === 'augment'
      ? 'keep the augmentation while it fills a deliberate empty slot; promote it to the base definition when ownership settles'
      : 'confirm the replacement is intentional and remove it once the upstream definition can carry the final value',
    ...(entry.declaredAt?.file === undefined ? {} : { file: entry.declaredAt.file }),
  }))
}

function manifestEscapes(manifest: VanityManifest): readonly VanityManifestEscape[] {
  return manifestModules(manifest).flatMap(module => module.escapes)
}

function manifestContrast(manifest: VanityManifest): readonly VanityManifestContrast[] {
  return manifestModules(manifest).flatMap(module => module.contrast)
}

function manifestStyles(manifest: VanityManifest): Readonly<Record<string, VanityManifestStyle>> {
  return Object.assign({}, ...manifestModules(manifest).map(module => module.styles))
}

// ─── The report ──────────────────────────────────────────────────────────────

const LANE_TITLES: Record<VanityAuditKind, string> = {
  unusedTokens: 'unused tokens',
  nearDuplicates: 'near-duplicate values',
  contrast: 'contrast acceptances',
  escapes: 'escape inventory',
  scaleStrays: 'scale strays',
  focusVisibility: 'focus visibility',
  specificityContexts: 'specificity and declaration contexts',
  rawAssertions: 'raw assertions',
  nonportableValues: 'nonportable values',
  ambiguousAxes: 'ambiguous axis triggers',
  mutableRootHazards: 'mutable root hazards',
  aliasEscapes: 'property-alias escapes',
  overwriteInventory: 'overwrite and augment inventory',
  eagerStyleBarrels: 'eager style barrels',
  cssParityGaps: 'CSS parity gaps',
  staleArtifacts: 'stale artifacts',
  rootModeDisagreements: 'root mode disagreements',
}

/** Grouped, deep-linked findings — what `pnpm run audit` prints. */
export function formatAuditFindings(findings: readonly VanityAuditFinding[]): string {
  if (findings.length === 0)
    return '✓ audit clean — no findings'

  const lines: string[] = []

  for (const kind of Object.keys(LANE_TITLES) as VanityAuditKind[]) {
    const lane = findings.filter(finding => finding.kind === kind)

    if (lane.length === 0)
      continue

    lines.push(`${LANE_TITLES[kind]} (${lane.length})`)

    for (const finding of lane) {
      const mark = finding.level === 'error' ? '✖' : '•'
      lines.push(`  ${mark} ${finding.message}${finding.file === undefined ? '' : `\n      at ${finding.file}`}`)

      if (finding.fix !== undefined)
        lines.push(`      fix: ${finding.fix}`)
    }

    lines.push('')
  }

  const errors = findings.filter(finding => finding.level === 'error').length
  lines.push(errors > 0
    ? `✖ ${findings.length} finding${findings.length === 1 ? '' : 's'}, ${errors} promoted to error`
    : `${findings.length} finding${findings.length === 1 ? '' : 's'} — advisory, nothing gates`)

  return lines.join('\n')
}
