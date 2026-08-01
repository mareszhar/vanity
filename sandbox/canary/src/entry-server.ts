import { ds } from './system'

export function renderCanarySeed() {
  const snapshot = ds.snapshotFrom((runtime) => {
    runtime.t.color.brand.$set('#16a34a')
    runtime.axes.scheme.$switchTo('dark')
  })

  return {
    snapshot,
    props: ds.runtimeProps(snapshot),
  }
}
