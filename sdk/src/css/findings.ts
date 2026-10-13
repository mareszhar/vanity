import type { VanityDiagnosticInput } from '../diagnostics'
import type { VanityDeclarationRecord } from './declaration'
import { formatVanityDiagnostic, getDiagnosticExports, normalizeDiagnostic, VanityError } from '../diagnostics'
import { collectDeclarationFinding, isInspecting } from '../introspect/records'

/** The classifier's record remains the source of evidence and baseline coordinates. */
export interface VanityDeclarationFinding {
  diagnostic: VanityDiagnosticInput
  declaration: VanityDeclarationRecord
  style?: string
  exports?: readonly string[]
}

/** Collect during evaluation; isolated authoring has no later host finalizer. */
export function reportDeclarationFindings(findings: readonly VanityDeclarationFinding[]): void {
  // Capture the authored site before another factory changes the source context.
  findings.forEach((finding) => {
    finding.diagnostic = normalizeDiagnostic(finding.diagnostic)
    finding.exports = getDiagnosticExports()
  })
  if (findings.length && !isInspecting()) {
    resolveDeclarationFindings(findings)
    return
  }
  findings.forEach(collectDeclarationFinding)
}

/** One finalization path for compatibility and declarations policy findings. */
export interface VanityFindingFinalization {
  /** The compiler supplies baseline acceptance; CSS authoring never reads files. */
  isAccepted?: (finding: VanityDeclarationFinding) => boolean
  collectFinding?: (finding: VanityDeclarationFinding, accepted: boolean) => void
}

export function resolveDeclarationFindings(findings: readonly VanityDeclarationFinding[], warning: (diagnostic: VanityDiagnosticInput) => void = diagnostic => console.warn(formatVanityDiagnostic(diagnostic)), finalization: VanityFindingFinalization = {}, warnings: readonly VanityDiagnosticInput[] = []): void {
  warnings.forEach(warning)
  const pending = findings.filter((finding) => {
    const accepted = finalization.isAccepted?.(finding) ?? false
    finalization.collectFinding?.(finding, accepted)
    return !accepted
  })
  const errors = pending.filter(finding => (finding.diagnostic.severity ?? 'error') === 'error')
  for (const finding of pending) {
    if (finding.diagnostic.severity === 'warning')
      warning(finding.diagnostic)
  }
  if (errors.length)
    throw new VanityError(errors.map(finding => finding.diagnostic))
}
