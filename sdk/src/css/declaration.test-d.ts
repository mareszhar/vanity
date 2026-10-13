import { createSystem } from '@mszr/vanity'
import { describe, it } from 'vitest'

describe('declaration data types', () => {
  it('narrows direct values, shorthand values, ports and fallback arrays', () => {
    const open = createSystem()
    const ds = open.addTokens({
      ink: open.oklch(0.3, 0.1, 30),
      space: open.length.px(8),
      zero: open.tdef.number({ val: 0, mutable: true }),
      duration: open.time.ms(100),
    }).consolidate()
    void ds.class({ color: ds.t.ink, padding: ds.t.space, opacity: ds.t.zero, border: ds.t.ink })
    void ds.class({ padding: 0, margin: open.calc(ds.t.space).multiply(2), color: ds.port(ds.t.ink) })
    // @ts-expect-error — a color token does not fill a length component
    void ds.class({ padding: ds.t.ink })
    // @ts-expect-error — a length token does not fill color
    void ds.class({ color: ds.t.space })
    // @ts-expect-error — zero's declared number type does not become a length
    void ds.class({ padding: ds.t.zero })
    // @ts-expect-error — no border component accepts time
    void ds.class({ border: ds.t.duration })
    // @ts-expect-error — a typed calculation retains its length type
    void ds.class({ color: open.calc(ds.t.space).multiply(2) })
    // @ts-expect-error — a port carries the data type of its default
    void ds.class({ color: ds.port(open.length.px(8)) })
    // @ts-expect-error — arrays do not bypass the component contract
    void ds.class({ padding: [ds.t.ink] })
  })
})
