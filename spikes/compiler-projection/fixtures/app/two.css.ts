import { ds } from './system.ts'

export default ds.style('two', {
  'border-color': ds.ref('brand'),
  'gap': ds.ref('space'),
})
