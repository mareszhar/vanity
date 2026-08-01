import { ds } from './system.ts'

export default ds.style('one', {
  color: ds.ref('brand'),
  padding: ds.ref('space'),
})
