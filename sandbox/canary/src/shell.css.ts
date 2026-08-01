import { ds } from './system'

export const shell = ds.class({
  color: ds.t.color.brand,
  background: ds.t.color.canvas,
  containerName: 'canary',
  containerType: 'inline-size',
  padding: ds.t.space.md,
})

export const relativeColors = ds.class({
  color: ds.rgb.from(ds.t.color.brand, {}),
  backgroundColor: ds.hsl.from(ds.t.color.brand, {}),
  borderTopColor: ds.hwb.from(ds.t.color.brand, {}),
  borderRightColor: ds.lab.from(ds.t.color.brand, {}),
  borderBottomColor: ds.lch.from(ds.t.color.brand, {}),
  borderLeftColor: ds.oklab.from(ds.t.color.brand, {}),
  outlineColor: ds.oklch.from(ds.t.color.brand, {}),
  textDecorationColor: ds.color.from(ds.t.color.brand, { space: 'display-p3' }),
})
