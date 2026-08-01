import type { VanityRawCssBlock } from '../css/raw'
import { transformCss } from '@vanilla-extract/css/transformCss'

type CssObject = Parameters<typeof transformCss>[0]['cssObjs'][number]

export function transformVanityCss(
  cssObjs: readonly (CssObject | VanityRawCssBlock)[],
  options: Omit<Parameters<typeof transformCss>[0], 'cssObjs'>,
): string {
  const output: string[] = []
  let ordinary: CssObject[] = []

  const flush = () => {
    if (ordinary.length === 0)
      return
    output.push(...transformCss({ ...options, cssObjs: ordinary }))
    ordinary = []
  }

  for (const css of cssObjs) {
    if ((css as VanityRawCssBlock).type === 'vanityRaw') {
      flush()
      output.push((css as VanityRawCssBlock).css)
    }
    else {
      ordinary.push(css as CssObject)
    }
  }
  flush()
  return output.join('\n')
}
