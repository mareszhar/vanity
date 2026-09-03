import { formatVanityDiagnostic, reportDiagnostics, VanityError } from '@mszr/vanity'
import { describe, expect, it } from 'vitest'

describe('structured diagnostics', () => {
  it('renders primary and related locations and exposes clickable author frames', () => {
    const diagnostic = {
      code: 'VANITY_SYSTEM_COLLISION' as const,
      severity: 'error' as const,
      message: 'color.brand is declared twice',
      file: 'system.ts',
      line: 12,
      column: 5,
      path: 'color.brand',
      related: [{
        message: 'first declaration',
        file: 'palette.ts',
        line: 4,
        column: 3,
      }],
      fix: 'give the second token a distinct name',
    }
    const error = new VanityError(diagnostic)

    expect(error.diagnostics[0]).toEqual({
      ...diagnostic,
      path: ['color', 'brand'],
      fix: { message: diagnostic.fix },
    })
    expect(formatVanityDiagnostic(diagnostic)).toContain('related: first declaration at palette.ts:4:3')
    expect(error.stack).toContain('at vanity.color.brand (system.ts:12:5)')
    expect(error.stack).toContain('at vanity.first_declaration (palette.ts:4:3)')
  })

  it('normalizes every sink payload to arrays, fix objects, and an explicit severity', () => {
    const received: unknown[] = []
    reportDiagnostics(diagnostic => received.push(diagnostic), {
      code: 'VANITY_CSS_INVALID_VALUE',
      message: 'bad radius',
      path: 'card.borderRadius',
      file: 'card.css.ts',
      line: 4,
      column: 3,
      fix: 'use 8px',
    })

    expect(received).toEqual([{
      code: 'VANITY_CSS_INVALID_VALUE',
      severity: 'error',
      message: 'bad radius',
      path: ['card', 'borderRadius'],
      file: 'card.css.ts',
      line: 4,
      column: 3,
      fix: { message: 'use 8px' },
    }])
  })
})
