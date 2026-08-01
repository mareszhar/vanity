/**
 * Nuxt enables cssnano's default preset for production builds. Its
 * `postcss-calc` transform currently parses a relative-color channel name
 * (`l`, `c`, `h`, …) as invalid arithmetic and reports a lexical error for
 * standards-valid values such as `oklch(from red calc(l + .1) c h)`.
 *
 * Calculation folding is only a size optimisation. Disable that one unsafe
 * transform while retaining every other cssnano default. Vanity's own calc
 * builder already folds computations that are statically knowable.
 */
export function protectRelativeColorSyntax(postcss: unknown): void {
  if (!isRecord(postcss) || !isRecord(postcss.plugins))
    return

  const configured = postcss.plugins.cssnano

  if (configured === false || configured == null)
    return

  if (configured === true) {
    postcss.plugins.cssnano = withSafeDefaultPreset({})
    return
  }

  if (!isRecord(configured))
    return

  const preset = configured.preset

  if (preset == null) {
    configured.preset = safeDefaultPreset()
    return
  }

  if (preset === 'default') {
    configured.preset = safeDefaultPreset()
    return
  }

  if (Array.isArray(preset) && preset[0] === 'default') {
    const options = isRecord(preset[1]) ? preset[1] : {}
    configured.preset = ['default', { ...options, calc: false }]
  }
}

function withSafeDefaultPreset(options: Record<string, unknown>): Record<string, unknown> {
  return { ...options, preset: safeDefaultPreset() }
}

function safeDefaultPreset(): ['default', { calc: false }] {
  return ['default', { calc: false }]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
