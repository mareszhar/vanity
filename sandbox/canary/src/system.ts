import {
  colorSchemes,
  container,
  createSystem,
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
export const ds = withScheme
  .addTokens({
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
  })
  .addConditions({
    conditionMatrix: scope('#app')
      .and(media({ width: { '>=': '1px' } }))
      .and(supports('(display: grid)'))
      .and(container('canary', { inlineSize: { '>=': '1px' } }))
      .and(selector('&[data-ready]')),
  })
  .addConsts({ product: 'reorientation-canary' })
  .consolidate({
    prefix: 'canary',
    root: ':root',
  })
