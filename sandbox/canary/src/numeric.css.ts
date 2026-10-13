import { ds } from './system'

const padding = ds.keyframes({
  from: { 'padding': 1, 'opacity': 1, '--canary-count': 1 },
  to: { 'padding': 1, 'opacity': 1, '--canary-count': 1 },
})

export const numericAnimation = ds.class({
  padding: 4,
  animationName: padding,
  animationDuration: '1s',
  animationDelay: '-0.5s',
  animationPlayState: 'paused',
  animationFillMode: 'both',
})
