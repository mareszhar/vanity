/**
 * The editor-DX evidence dimension for the Vue overlay: the composables' hovers stay
 * readable public types, part names autocomplete off the computed record, and
 * a wrong variant value dies at the key ([patterns.md §10]).
 */

import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

const defineOverlay = `
import { createSystem } from '@mszr/vanity'
import { propsOf, useAnatomy, usePorts } from '@mszr/vanity/vue'

const ds = createSystem()
  .addTokens({ space: { sm: '8px' } })
  .consolidate()
const { anatomy, port } = ds

const fraction = port(0)

const dialog = anatomy({
  parts: ['backdrop', 'content', 'title'],
  base: { content: { padding: 8 } },
  variants: {
    size: {
      sm: { content: { maxWidth: '28rem' } },
      lg: { content: { maxWidth: '52rem' } },
    },
  },
  defaults: { size: 'sm' },
})

void propsOf; void useAnatomy; void usePorts; void fraction; void dialog
`

describe('the vue overlay, at the cursor', () => {
  it('the spec-shaped usage raises no diagnostics', () => {
    const { errors } = project.check`${defineOverlay}
      const d = useAnatomy(dialog, { size: 'lg' })
      const style = usePorts(() => [fraction.dec(0.5)])
      void d.value.content
      void style.value
    `
    expect(errors).toBeClean()
  })

  it('part names autocomplete off the computed record', () => {
    const result = project.query`${defineOverlay}
      const d = useAnatomy(dialog)
      void d.value.${cursor}
    `
    expect(result.completions).toContainCompletions(['backdrop', 'content', 'title'])
  })

  it('a wrong variant value dies at the key', () => {
    const { errors } = project.check`${defineOverlay}
      void useAnatomy(dialog, { size: 'smm' })
    `
    expect(errors).toHaveError(/smm|sm|lg/)
    expect(errors).toHaveErrorCount(1)
  })

  it('a non-fragment port source dies at the argument', () => {
    const { errors } = project.check`${defineOverlay}
      void usePorts(5)
    `
    expect(errors).toHaveErrorCount(1)
  })

  it('propsOf avoids overload noise while preserving exact projected variants', () => {
    const result = project.query`${defineOverlay}
      const options = ${cursor}propsOf(dialog)
      void options
    `
    const hover = result.hover ?? ''
    // TypeScript repeats the inferred shape in the generic argument, parameter,
    // and return alias. Removing any one of those sites loses exact projection;
    // the important contract is no extra overload or internal helper noise.
    expect(hover.match(/size\?: "sm" \| "lg"/g) ?? []).toHaveLength(3)
    expect(hover).not.toContain('overload')
    expect(hover).not.toContain('(+1 overload)')
  })

  it('the Nuxt preset keeps propsOf typed as the public export, never any', () => {
    const result = project.query`${defineOverlay}
      const nuxtPropsOf: typeof import('@mszr/vanity/vue').propsOf = propsOf
      const options = ${cursor}nuxtPropsOf(dialog)
      void options
    `
    const hover = result.hover ?? ''
    expect(hover).toMatch(/size\?: "sm" \| "lg"/)
    expect(hover).not.toMatch(/\bany\b/)
    expect(hover).not.toContain('overload')
  })
})
