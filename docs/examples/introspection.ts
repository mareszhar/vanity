import {
  colorSchemes,
  createSystem,
  exportDesignTokens,
  importDesignTokens,
} from '@mszr/vanity'

const open = createSystem().addAxis('scheme', colorSchemes({ locality: 'root' }))
const tokens = open.defineTokens({
  color: {
    brand: open.tdef.color({
      val: open.oklch(0.58, 0.2, 285),
      axes: { scheme: { dark: open.oklch(0.72, 0.14, 285) } },
    }),
  },
})
const ds = open.addTokens(tokens).consolidate({
  audit: { unusedTokens: 'warn', escapes: 'error' },
  prefix: 'introspection-doc',
})

void ds.explain(ds.t.color.brand)
const resolved = exportDesignTokens(ds, { mode: 'resolved', environment: { scheme: 'dark' } })
const authored = exportDesignTokens(ds, { mode: 'authored' })
void importDesignTokens(resolved, { system: open })
void importDesignTokens(authored, { system: open })
