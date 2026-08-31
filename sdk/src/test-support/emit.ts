/**
 * The output-evidence harness: run a style-module body in-process against the
 * vanilla-extract substrate and return the CSS it emitted — the same adapter +
 * transform pipeline the real compiler drives, without a bundler in the loop.
 */

import { removeAdapter, setAdapter } from '@vanilla-extract/css/adapter'
import { endFileScope, setFileScope } from '@vanilla-extract/css/fileScope'
import { transformVanityCss } from '../internal/transformCss'

type Adapter = Parameters<typeof setAdapter>[0]

export interface EmitResult<T> {
  css: string
  returned: T
}

type CssObj = Parameters<Adapter['appendCss']>[0]

/** Evaluate `body` as if it were `prism.css.ts` and capture the emitted CSS. */
export function emit<T>(body: () => T): EmitResult<T> {
  const cssObjs: CssObj[] = []
  const localClassNames = new Set<string>()

  const adapter: Adapter = {
    appendCss: (cssObj: CssObj) => void cssObjs.push(cssObj),
    registerClassName: (className: string) => void localClassNames.add(className),
    registerComposition: () => {},
    markCompositionUsed: () => {},
    onEndFileScope: () => {},
    getIdentOption: () => 'debug',
  }

  setAdapter(adapter)
  setFileScope('src/test-support/prism.css.ts', '@prism/fixture')

  try {
    const returned = body()
    const css = transformVanityCss(cssObjs as any, {
      localClassNames: [...localClassNames],
      composedClassLists: [],
    })

    return { css, returned }
  }
  finally {
    endFileScope()
    removeAdapter()
  }
}
