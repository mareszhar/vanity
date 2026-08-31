/**
 * The runtime evidence dimension for the Vue overlay ([spec-vue.md §1–2]): `usePorts`
 * merges fragments reactively (thunk) or statically (plain fragments), and
 * `useAnatomy` keeps the record of part classes tracking its props.
 */

import { propsOf, useAnatomy, usePorts } from '@mszr/vanity/vue'
import { definePrismSystem, emit } from '@test'
import { describe, expect, it } from 'vitest'
import { reactive, ref } from 'vue'

function prismPorts() {
  return emit(() => {
    const { port } = definePrismSystem()
    return { fraction: port(0), width: port('100%') }
  }).returned
}

function prismDialog() {
  return emit(() => {
    const { anatomy } = definePrismSystem()

    return anatomy({
      parts: ['root', 'content'],
      base: { content: { padding: 8 } },
      variants: {
        size: {
          sm: { content: { maxWidth: '28rem' } },
          lg: { content: { maxWidth: '52rem' } },
        },
      },
      defaults: { size: 'sm' },
    }, 'dialog')
  }).returned
}

describe('usePorts', () => {
  it('a thunk is reactive: the source drives the merged fragment', () => {
    const { fraction } = prismPorts()
    const value = ref(0.25)

    const style = usePorts(() => fraction.dec(value.value))
    expect(style.value).toEqual({ [fraction.name]: 0.25 })

    value.value = 0.75
    expect(style.value).toEqual({ [fraction.name]: 0.75 })
  })

  it('the thunk\'s array is the merge — falsy entries skipped, no ports() wrapper', () => {
    const { fraction, width } = prismPorts()
    const expanded = ref(false)

    const style = usePorts(() => [fraction.dec(0.5), expanded.value && width.dec('50%')])
    expect(style.value).toEqual({ [fraction.name]: 0.5 })

    expanded.value = true
    expect(style.value).toEqual({ [fraction.name]: 0.5, [width.name]: '50%' })
  })

  it('plain fragments bind statically', () => {
    const { fraction, width } = prismPorts()

    expect(usePorts(fraction.dec(1)).value).toEqual({ [fraction.name]: 1 })
    expect(usePorts([fraction.dec(1), width.dec('2rem')]).value)
      .toEqual({ [fraction.name]: 1, [width.name]: '2rem' })
  })
})

describe('propsOf', () => {
  it('projects the variant space into a Vue props declaration', () => {
    const { returned: button } = emit(() => {
      const { recipe } = definePrismSystem()

      return recipe({
        base: { padding: 8 },
        variants: { intent: { brand: {}, ghost: {} }, size: { sm: {}, md: {} } },
        toggles: { pill: {} },
        defaults: { intent: 'brand', size: 'md' },
      }, 'button')
    })

    expect(propsOf(button)).toEqual({
      intent: { type: String },
      size: { type: String },
      pill: { type: Boolean },
    })
  })

  it('reads an anatomy identically — one mental model', () => {
    const dialog = prismDialog()

    expect(propsOf(dialog)).toEqual({ size: { type: String } })
  })

  it('uses object keys as stable prefixes for multi-component projection', () => {
    const dialog = prismDialog()

    expect(propsOf.group({ dialog, compact: propsOf(dialog) })).toEqual({
      'dialog-size': { type: String },
      'compact-size': { type: String },
    })
  })
})

describe('useAnatomy', () => {
  it('tracks a reactive props object', () => {
    const dialog = prismDialog()
    const props = reactive<{ size?: 'sm' | 'lg' }>({ size: 'sm' })

    const d = useAnatomy(dialog, props)
    const small = d.value.content

    props.size = 'lg'
    expect(d.value.content).not.toBe(small)
    expect(d.value.content).toBe(dialog({ size: 'lg' }).content)
  })

  it('accepts a getter', () => {
    const dialog = prismDialog()
    const size = ref<'sm' | 'lg'>('sm')

    const d = useAnatomy(dialog, () => ({ size: size.value }))
    expect(d.value.content).toBe(dialog({ size: 'sm' }).content)

    size.value = 'lg'
    expect(d.value.content).toBe(dialog({ size: 'lg' }).content)
  })

  it('resolves the defaults with no props at all', () => {
    const dialog = prismDialog()

    expect(useAnatomy(dialog).value.content).toBe(dialog().content)
  })

  it('the call-site law holds: a wider props object flows through', () => {
    const dialog = prismDialog()
    const props = reactive({ size: 'lg' as const, disabled: true, title: 'hello' })

    expect(useAnatomy(dialog, props).value.content).toBe(dialog({ size: 'lg' }).content)
  })
})
