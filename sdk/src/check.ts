import type { EvaluatedSystem } from './compiler/core/systems'
import type { BaselineModule, VanityBaselineEntry } from './compiler/modules/baseline'
import type { BundleExternalModule } from './compiler/modules/build'
/** Complete headless reports over the existing style compiler. */
import type { VanityDeclarationFinding } from './css/findings'
import type { VanityDiagnostic } from './diagnostics'
import type { VanityAuditFinding } from './introspect/audit'
import type { VanityManifest, VanityManifestToken } from './introspect/manifest'
import type { VanityContrastRecord, VanityInspectRecord } from './introspect/records'
import { execFile } from 'node:child_process'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { getAutoImportRoles } from './compiler/auto-imports/autoImportPlan'
import { prepareStyleAutoImports } from './compiler/auto-imports/styleInjection'
import { orderCompilerRoots, renderLayerStatement } from './compiler/core/layers'
import { normalizePath } from './compiler/core/path'
import { prepareSystemSource } from './compiler/core/prepareSystem'
import { createSystemRecordFromPortable } from './compiler/core/registration'
import { createConfiguredSystemResolutionCache, getConfiguredSystemModuleFiles } from './compiler/core/systems'
import { createCheckHost } from './compiler/hosts/check'
import { resolveViteSystemSources } from './compiler/hosts/viteSystems'
import { readCompilerBaseline } from './compiler/modules/baseline'
import { buildStyleModule } from './compiler/modules/build'
import { createStyleBuildError } from './compiler/modules/errors'
import { evaluateStyleModule } from './compiler/modules/evaluate'
import { enrichStyleEvaluationError } from './compiler/modules/resolution'
import { resolveDeclarationFindings } from './css/findings'
import { formatVanityDiagnostic, normalizeDiagnostic } from './diagnostics'
import { audit, runSystemAudit } from './introspect/audit'
import { formatContrastEvidence } from './introspect/contrast'
import { diffManifests } from './introspect/diff'
import { buildManifest } from './introspect/manifest'
import { assertManifestShape } from './introspect/manifestValidation'

/** Inputs for one source check through the project's configured host pipeline. */
export interface VanityCheckOptions {
  /** Project directory; defaults to the current working directory. */
  root?: string
  /** Shared Vanity configuration path, resolved from the project root. */
  config?: string
  /** Explicit manifest snapshot to compare with the current role vocabulary. */
  against?: string
  /** Reconcile observed policy findings while retaining unevaluated entries. */
  writeBaseline?: boolean
}
/** A compiler diagnostic with authored policy identity and declaration evidence. */
export interface VanityCheckDiagnostic extends VanityDiagnostic {
  /** Stable baseline coordinates; source line movement does not change them. */
  identity?: VanityBaselineEntry
  /** Evidence carried by each component of the authored declaration. */
  evidence?: VanityDeclarationFinding['declaration']['components'][number]['evidence'][]
  /** Whether the project baseline accepts this occurrence. */
  accepted?: boolean
}
/** Versioned check output; coverage and unevaluated records bound every verdict. */
export interface VanityCheckReport {
  format: 'vanity.check/1'
  diagnostics: VanityCheckDiagnostic[]
  coverage: { total: number, evaluated: number, rejected: number, failed: number, blocked: number, unresolved: number, cssEmitted: number, cssComplete: boolean }
  modules: Array<{ source: string, status: 'evaluated' | 'rejected' | 'failed' | 'blocked', cssComplete: boolean }>
  audits: VanityAuditFinding[]
  unevaluated: Array<{ kind: string, reason: string }>
  baseline: { file: string | null, observed: VanityBaselineEntry[], accepted: number, resolved: VanityBaselineEntry[], unevaluated: Array<{ entry: VanityBaselineEntry, reason: string }> }
  comparison: { file: string, diff: ReturnType<typeof diffManifests>, roles: { added: string[], changedValues: string[], changedRestrictions: string[], removed: string[] } } | null
  snapshot: { manifest: string | null, app: { revision?: string, dirty?: boolean, strength: 'approximate' } }
  unresolved: Array<{ module: string, style?: string, property: string, reason: string }>
  exceptions: VanityInspectRecord[]
  derivations: Array<{ module: string, style?: string, property: string, derivation: unknown }>
  contrast?: VanityContrastRecord[]
  /** Observed uses of registered axis-qualified conditions; completeness follows coverage. */
  modeStyles?: Array<{ axis: string, mode: string, styles: number, declarations: number }>
  exitCode: 0 | 1 | 2
}
/** Count authored conditional structure from the compiler's existing capture. */
function countModeStyles(records: readonly VanityInspectRecord[]): NonNullable<VanityCheckReport['modeStyles']> {
  const modes = new Map<string, { axis: string, mode: string, styles: Set<string>, declarations: Set<string> }>()
  for (const record of records) {
    if (record.kind !== 'system')
      continue
    for (const [axis, definition] of Object.entries(record.axes?.definitions ?? {})) {
      for (const mode of definition.modeOrder)
        modes.set(`${axis}.${mode}`, { axis, mode, styles: new Set(), declarations: new Set() })
    }
  }
  for (const record of records) {
    if (record.kind !== 'style')
      continue
    const style = JSON.stringify([record.file, record.class])
    for (const declaration of record.declarations ?? []) {
      for (const condition of declaration.conditionPath ?? []) {
        const counted = modes.get(condition)
        if (!counted)
          continue
        counted.styles.add(style)
        counted.declarations.add(JSON.stringify([style, declaration.conditionPath, declaration.property, declaration.normalizedValue ?? declaration.value]))
      }
    }
  }
  return [...modes.values()].filter(row => row.styles.size > 0).map(row => ({ axis: row.axis, mode: row.mode, styles: row.styles.size, declarations: row.declarations.size })).sort((left, right) => left.axis.localeCompare(right.axis) || left.mode.localeCompare(right.mode))
}

/** Headless compiler evidence and its available CSS and manifest projections. */
export interface VanityCheckResult {
  report: VanityCheckReport
  /** Compiler CSS before the application's bundler packs assets; used for host parity. */
  css: ReadonlyMap<string, string>
  manifest?: VanityManifest
}
const execute = promisify(execFile)
async function readApplicationRevision(root: string): Promise<VanityCheckReport['snapshot']['app']> {
  try {
    const revision = (await execute('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim()
    const dirty = (await execute('git', ['status', '--porcelain'], { cwd: root })).stdout.trim().length > 0
    return { revision, dirty, strength: 'approximate' }
  }
  catch { return { strength: 'approximate' } }
}
const ignored = new Set(['node_modules', '.git', '.vanity', '.nuxt', '.output', '.wxt', 'dist', 'coverage', '__temp__'])
async function findStyleModules(root: string): Promise<string[]> {
  const files: string[] = []
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && !ignored.has(entry.name))
        await visit(join(directory, entry.name))
      else if (entry.isFile() && /\.css\.(?:js|cjs|mjs|jsx|ts|tsx)$/.test(entry.name))
        files.push(join(directory, entry.name))
    }
  }
  await visit(root)
  return files.sort()
}
function getCheckDiagnostics(error: unknown, file: string, root: string): VanityDiagnostic[] {
  const normalized = createStyleBuildError(error, file, root) as { diagnostics: readonly VanityDiagnostic[] }
  return normalized.diagnostics.map(normalizeDiagnostic)
}
function isResolutionFailure(error: unknown): boolean {
  return /Cannot resolve|could not resolve|Optimizer metadata|Host did not load virtual/.test(String(error))
}

/** Project role occurrences from the existing diff's repeated identity categories. */
function compareRoles(diff: ReturnType<typeof diffManifests>): NonNullable<VanityCheckReport['comparison']>['roles'] {
  const tokens = new Map(diff.changes.filter(change => change.path.length === 3 && change.path[0] === 'system' && change.path[1] === 'tokens').map(change => [change.path[2]!, change]))
  const roles: NonNullable<VanityCheckReport['comparison']>['roles'] = { added: [], changedValues: [], changedRestrictions: [], removed: [] }
  const values = (token: VanityManifestToken) => JSON.stringify({ hasDefault: token.hasDefault, preview: token.preview, declarations: token.declarations, branches: token.branches })
  for (const [path, change] of tokens) {
    if (change.operation === 'added') {
      roles.added.push(path)
    }
    else if (change.operation === 'removed') {
      roles.removed.push(path)
    }
    else {
      if (values(change.before as VanityManifestToken) !== values(change.after as VanityManifestToken))
        roles.changedValues.push(path)
      if (JSON.stringify((change.before as VanityManifestToken).restrict) !== JSON.stringify((change.after as VanityManifestToken).restrict))
        roles.changedRestrictions.push(path)
    }
  }
  return roles
}

/**
 * Evaluate every style module, retain partial evidence, and close the host pipeline.
 *
 * @example
 * const { report } = await checkProject({ root: '.', against: '.vanity/main.manifest.json' })
 *
 * Nuxt requires its framework build; an unavailable host produces exit code 2.
 */
export async function checkProject(options: VanityCheckOptions = {}): Promise<VanityCheckResult> {
  const root = resolve(options.root ?? '.')
  const report: VanityCheckReport = {
    format: 'vanity.check/1',
    diagnostics: [],
    coverage: { total: 0, evaluated: 0, rejected: 0, failed: 0, blocked: 0, unresolved: 0, cssEmitted: 0, cssComplete: false },
    modules: [],
    audits: [],
    unevaluated: [],
    baseline: { file: null, observed: [], accepted: 0, resolved: [], unevaluated: [] },
    comparison: null,
    snapshot: { manifest: null, app: await readApplicationRevision(root) },
    unresolved: [],
    exceptions: [],
    derivations: [],
    exitCode: 0,
  }
  const css = new Map<string, string>()
  let manifest: VanityManifest | undefined
  let close: (() => Promise<void>) | undefined
  try {
    const acquired = await createCheckHost(root, options.config)
    close = acquired.close
    const compiler = acquired.options.compiler ?? {}
    const identifiers = compiler.identifiers ?? (acquired.server.config.mode === 'production' ? 'short' : 'debug')
    const baseline = readCompilerBaseline(root, compiler.baseline)
    report.baseline.file = normalizePath(relative(root, baseline.file))
    const cache = createConfiguredSystemResolutionCache()
    const sources = await resolveViteSystemSources(acquired.server.config, compiler.system)
    const evaluated = new Map<string, EvaluatedSystem>()
    const failedSystems = new Set<string>()
    const records: VanityInspectRecord[] = []
    const sessions: BaselineModule[] = []
    const reportedFindings = new Set<string>()
    function collectModuleFindings(session: BaselineModule): void {
      report.diagnostics.push(...(session.capture?.warnings ?? []).map(normalizeDiagnostic))
      if (!session.findings.length && session.capture?.findings.length) {
        try {
          resolveDeclarationFindings(session.capture.findings, () => {}, session.finalization)
        }
        catch { /* The same finalizer reports through observe; the original authored failure is retained below. */ }
      }
      const occurrences = new Map<string, number>()
      for (const row of session.findings) {
        const identity = JSON.stringify(row.identity)
        const occurrence = (occurrences.get(identity) ?? 0) + 1
        occurrences.set(identity, occurrence)
        const key = JSON.stringify([identity, occurrence])
        if (reportedFindings.has(key))
          continue
        reportedFindings.add(key)
        report.diagnostics.push({ ...normalizeDiagnostic(row.finding.diagnostic), identity: row.identity, evidence: row.finding.declaration.components.map(component => component.evidence), accepted: row.accepted })
      }
      if (session.capture)
        records.push(...session.capture.records)
    }
    function reportModuleFailure(error: unknown, file: string, session?: BaselineModule): void {
      if (isResolutionFailure(error))
        report.exitCode = 2
      const pending = getCheckDiagnostics(error, file, root).filter(diagnostic => !session?.findings.some(row => row.finding.diagnostic.code === diagnostic.code && row.finding.diagnostic.line === diagnostic.line && row.finding.diagnostic.message === diagnostic.message))
      report.diagnostics.push(...pending)
    }
    for (const source of sources) {
      let session: BaselineModule | undefined
      try {
        const prepared = await prepareSystemSource({ source, root, host: acquired.host, cache, identifiers, baseline: compiler.baseline, reportWarning: () => {}, collectCapture(value) {
          session = value
          sessions.push(value)
        } })
        evaluated.set(source.entry, prepared.evaluated)
        records.push(createSystemRecordFromPortable(prepared.evaluated.portable))
        css.set(normalizePath(relative(root, source.entry)), prepared.evaluated.css)
      }
      catch (error) {
        failedSystems.add(source.entry)
        reportModuleFailure(error, source.entry, session)
      }
      if (session)
        collectModuleFindings(session)
    }
    const externals: BundleExternalModule[] = sources.flatMap((source, index) => {
      const system = evaluated.get(source.entry)
      const namespaces = system ? [...system.moduleExports] : [...getConfiguredSystemModuleFiles(source, root, cache)].map(file => [file, {}] as const)
      return namespaces.map(([moduleFile, exports], member) => ({ id: `vanity:build-system:${index}:${member}`, moduleFile, source, exports }))
    })
    const injectionState = { systemDeps: new Set<string>(), systemSource: undefined as string | undefined, shimContent: undefined as string | undefined }
    const files = await findStyleModules(root)
    report.coverage.total = files.length
    for (const file of files) {
      const source = normalizePath(relative(root, file))
      const session = baseline.createModuleSession(file)
      sessions.push(session)
      let status: VanityCheckReport['modules'][number]['status'] = 'failed'
      let bundled: Awaited<ReturnType<typeof buildStyleModule>> | undefined
      try {
        const injection = await prepareStyleAutoImports({ values: getAutoImportRoles(acquired.options).style, system: compiler.system, root, state: injectionState, host: acquired.host, filePath: file })
        bundled = await buildStyleModule({ filePath: file, root, ...acquired.host, inject: injection?.path, ambientAliases: injection?.aliases, externalModules: externals })
        if (bundled.externalSystemEntries.some(entry => failedSystems.has(entry))) {
          status = 'blocked'
        }
        else {
          try {
            const result = evaluateStyleModule(bundled.source, file, identifiers, new Map(externals.map(module => [module.id, module.exports])), () => {}, session.finalization)
            css.set(source, [...result.cssByFileScope.values()].join('\n'))
            status = 'evaluated'
          }
          catch (error) {
            throw await enrichStyleEvaluationError(error, bundled, root)
          }
        }
      }
      catch (error) {
        // Finalization fails after a complete authored body; coverage distinguishes that from interruption.
        status = session.capture?.complete ? 'rejected' : 'failed'
        reportModuleFailure(error, file, session)
      }
      collectModuleFindings(session)
      report.modules.push({ source, status, cssComplete: status === 'evaluated' })
      if (status === 'evaluated' || status === 'rejected')
        report.coverage.evaluated++
      if (status === 'rejected')
        report.coverage.rejected++
      if (status === 'failed')
        report.coverage.failed++
      if (status === 'blocked')
        report.coverage.blocked++
      if (status === 'evaluated')
        report.coverage.cssEmitted++
      for (const record of session.capture?.records ?? []) {
        if (record.kind !== 'style')
          continue
        for (const declaration of record.declarations ?? []) {
          for (const component of declaration.components) {
            if (component.evidence.level === 'unresolved')
              report.unresolved.push({ module: source, style: record.name, property: declaration.property, reason: component.evidence.reason })
            if (component.derivation)
              report.derivations.push({ module: source, style: record.name, property: declaration.property, derivation: component.derivation })
          }
        }
      }
    }
    const modeStyles = countModeStyles(records)
    if (modeStyles.length)
      report.modeStyles = modeStyles
    const reconciled = baseline.reconcile(sessions)
    report.baseline.observed = reconciled.entries
    report.baseline.resolved = reconciled.resolved
    report.baseline.unevaluated = reconciled.unevaluated
    report.baseline.accepted = report.diagnostics.filter(diagnostic => diagnostic.accepted).length
    if (options.writeBaseline)
      await writeFile(baseline.file, `${JSON.stringify({ format: 'vanity.baseline/1', entries: reconciled.entries }, null, 2)}\n`)
    report.exceptions = records.filter(record => record.kind === 'escape')
    report.coverage.unresolved = report.unresolved.length
    report.coverage.cssComplete = failedSystems.size === 0 && report.modules.every(module => module.cssComplete)
    const rootLayers = sources.flatMap(source => evaluated.get(source.entry)?.portable.layerRoot ?? [])
    const layerStatement = renderLayerStatement(orderCompilerRoots(compiler.layerOrder, rootLayers))
    for (const [file, contents] of css) css.set(file, layerStatement + contents)
    const emittedCss = [...css.values()].join('\n')
    if (records.some(record => record.kind === 'system' && record.portable !== undefined)) {
      manifest = buildManifest(records, emittedCss, { root })
      const contrast = Object.values(manifest.modules).flatMap(module => module.contrast.map(({ id: _id, owner: _owner, declaredAt, description: _description, ...record }) => ({ ...record, ...(declaredAt?.file ? { file: declaredAt.file } : {}) })))
      if (contrast.length)
        report.contrast = contrast
      report.snapshot.manifest = manifest.system.identities.docs
      const deferred = runSystemAudit(manifest.system).unevaluated.filter(row => (row.requires === 'buildEvidence' && row.kind !== 'unanchoredSelectors')
        || (row.kind === 'unanchoredSelectors' && (failedSystems.size > 0 || report.coverage.failed > 0 || report.coverage.blocked > 0))
        || (row.requires === 'emittedCss' && !report.coverage.cssComplete)
        || (row.requires === 'moduleUsage' && (failedSystems.size > 0 || report.coverage.failed > 0 || report.coverage.blocked > 0)))
      report.unevaluated = deferred.map(row => ({ kind: row.kind, reason: row.kind === 'unanchoredSelectors'
        ? 'some authored modules or systems were not completely evaluated'
        : row.requires === 'buildEvidence'
          ? 'application build evidence was not supplied'
          : row.requires === 'emittedCss' ? 'emitted CSS is incomplete' : 'some authored modules or systems were not completely evaluated' }))
      // Reuse the audit's own evidence categories and level handling; partial inputs cannot yield verdicts.
      report.audits = audit(manifest, emittedCss, Object.fromEntries(deferred.map(row => [row.kind, 'off' as const])), { selectorWarnings: report.diagnostics.filter(row => row.code === 'VANITY_SELECTOR_UNANCHORED') })
    }
    else {
      report.unevaluated.push({ kind: 'system', reason: 'no system evaluated successfully' })
    }
    if (options.against !== undefined) {
      const file = resolve(root, options.against)
      const before: unknown = JSON.parse(await readFile(file, 'utf8'))
      assertManifestShape(before)
      if (manifest) {
        const diff = diffManifests(before, manifest)
        report.comparison = { file: normalizePath(relative(root, file)), diff, roles: compareRoles(diff) }
      }
      else {
        report.unevaluated.push({ kind: 'comparison', reason: 'a current manifest could not be established' })
      }
    }
    if (report.exitCode !== 2 && (report.coverage.failed || report.coverage.blocked || report.diagnostics.some(row => row.severity === 'error' && !row.accepted) || report.audits.some(row => row.level === 'error')))
      report.exitCode = 1
  }
  catch (error) {
    report.diagnostics.push(...getCheckDiagnostics(error, root, root))
    report.exitCode = 2
  }
  finally { await close?.() }
  return { report, css, ...(manifest ? { manifest } : {}) }
}

export function formatCheckReport(report: VanityCheckReport, options: { unresolved?: boolean, exceptions?: boolean, derivations?: boolean, roles?: boolean } = {}): string {
  return [
    ...report.diagnostics.map(diagnostic => `${diagnostic.accepted ? 'accepted  ' : ''}${formatVanityDiagnostic(diagnostic)}`),
    ...report.audits.filter(finding => !report.diagnostics.some(row => row.code === finding.code && row.message === finding.message && row.file === finding.file)).map(finding => `${finding.level} ${finding.kind}: ${finding.message}${finding.fix ? `\n  fix: ${finding.fix}` : ''}`),
    ...(report.contrast ?? []).map(record => `${record.pairing} · ${record.scheme} · ${record.algorithm === 'apca' ? `APCA Lc ${record.measured}` : `WCAG 2 ${record.measured}:1`} · ${formatContrastEvidence(record)}`),
    '',
    ...(report.modeStyles ?? []).map(row => `Mode structure ${row.axis}.${row.mode}: ${row.styles} styles, ${row.declarations} declarations (observed)`),
    'Coverage',
    `  Authored bodies evaluated ${report.coverage.evaluated} / ${report.coverage.total} style modules; rejected after evaluation ${report.coverage.rejected}`,
    `  Failed during evaluation ${report.coverage.failed}; blocked by a failing system ${report.coverage.blocked}`,
    `  CSS emitted for ${report.coverage.cssEmitted} / ${report.coverage.total} style modules; ${report.coverage.cssComplete ? 'complete' : 'incomplete'}`,
    `  Declarations unresolved ${report.coverage.unresolved}${options.unresolved ? `\n${JSON.stringify(report.unresolved, null, 2)}` : ' — use --unresolved to list'}`,
    `  Audits without evidence ${report.unevaluated.length}: ${report.unevaluated.map(row => `${row.kind} (${row.reason})`).join('; ')}`,
    report.comparison
      ? `Roles against ${report.comparison.file}: ${report.comparison.roles.added.length} added, ${report.comparison.roles.changedValues.length} changed value, ${report.comparison.roles.removed.length} removed, ${report.comparison.roles.changedRestrictions.length} changed restriction${options.roles
        ? `\n${[
          ...report.comparison.roles.added.map(path => `  added: ${path}`),
          ...report.comparison.roles.changedValues.map(path => `  changed value: ${path}`),
          ...report.comparison.roles.removed.map(path => `  removed: ${path}`),
          ...report.comparison.roles.changedRestrictions.map(path => `  changed restriction: ${path}`),
        ].join('\n')}`
        : ' — use --roles to list'}`
      : 'No comparison manifest supplied.',
    `Baseline (${report.baseline.file ?? 'unavailable'}): ${report.baseline.accepted} accepted, ${report.baseline.resolved.length} resolved, ${report.baseline.unevaluated.length} unevaluated`,
    ...(options.exceptions ? [JSON.stringify(report.exceptions, null, 2)] : []),
    ...(options.derivations ? [JSON.stringify(report.derivations, null, 2)] : []),
    `Snapshot ${report.snapshot.manifest ?? 'unavailable'} · exit ${report.exitCode}`,
  ].join('\n')
}
