/**
 * The output-evidence runner: run a style-module body in-process against the
 * vanilla-extract substrate and return the CSS it emitted — the same adapter +
 * transform pipeline the real compiler drives, without a bundler in the loop.
 */

import { substrate } from '../substrate'

export interface EmitResult<T> {
  css: string
  returned: T
}

/** Evaluate `body` as if it were `prism.css.ts` and capture the emitted CSS. */
export function emit<T>(body: () => T): EmitResult<T> {
  const cssObjs: unknown[] = []
  const localClassNames = new Set<string>()

  substrate.modules.installCapture({
    appendCss: cssObj => void cssObjs.push(cssObj),
    registerClassName: className => void localClassNames.add(className),
    registerComposition: () => {},
    markCompositionUsed: () => {},
    getIdentOption: () => 'debug',
  })

  substrate.modules.setFileScope({ filePath: 'src/test-support/prism.css.ts', packageName: '@prism/fixture' })

  try {
    const returned = body()
    const css = substrate.modules.transformStyleModule({
      cssObjects: cssObjs,
      localClassNames: [...localClassNames],
      composedClassLists: [],
    }).css

    return { css, returned }
  }
  finally {
    substrate.modules.endFileScope()
    substrate.modules.removeCapture()
  }
}
