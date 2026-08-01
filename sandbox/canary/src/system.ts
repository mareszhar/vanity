import {
  colorSchemes,
  container,
  createSystem,
  defineConditions,
  defineConsts,
  media,
  scope,
  selector,
  supports,
} from '@mszr/vanity'

const open = createSystem()
const withScheme = open.addAxis('scheme', colorSchemes({ locality: 'root' }))
const panel = withScheme.defineTokens({
  accent: withScheme.tdef.color({
    val: '#0f172a',
    axes: { scheme: { dark: '#f8fafc' } },
  }),
}).root('#panel')
const canaryConditions = defineConditions({
  conditionMatrix: scope('#app')
    .and(media({ width: { '>=': '1px' } }))
    .and(supports('(display: grid)'))
    .and(container('canary', { inlineSize: { '>=': '1px' } }))
    .and(selector('&[data-ready]')),
})
const canaryConsts = defineConsts({
  product: 'reorientation-canary',
})

export const ds = withScheme
  .addTokens(withScheme.defineTokens({
    color: {
      brand: withScheme.tdef.color({
        val: '#635bff',
        mutable: true,
        axes: {
          scheme: {
            dark: '#a89cff',
          },
        },
      }),
      canvas: '#ffffff',
    },
    space: {
      md: '16px',
    },
    panel,
  }))
  .addConditions(canaryConditions)
  .addConsts(canaryConsts)
  .consolidate({
    prefix: 'canary',
    root: ':root',
  })
