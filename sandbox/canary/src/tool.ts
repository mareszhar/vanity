/** Plain Node/tool-plane import: no style scope, DOM, or compiler projection. */

import { ds } from './system'

const contract = ds.introspect()
const explanation = ds.explain(ds.t.color.brand)

if (contract.format !== 'vanity.introspection/1' || contract.prefix !== 'canary')
  throw new Error('the canary tool import did not expose its semantic system map')
if (
  explanation.path.join('.') !== 'color.brand'
  || explanation.type !== 'color'
  || explanation.mutable !== true
) {
  throw new Error('the canary tool import did not expose its token explanation')
}
