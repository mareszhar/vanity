/** Observe the existing pipeline without creating or replaying it. */
export function instrumentLifecycle(events, getPhase) {
  return {
    name: 'fixture-lifecycle',
    configResolved(config) {
      for (const plugin of config.plugins) {
        for (const name of ['configureServer', 'buildStart', 'closeBundle']) {
          const hook = plugin[name]
          if (!hook)
            continue
          const current = typeof hook === 'function' ? hook : hook.handler
          const handler = current.original ?? current
          const phase = getPhase()
          const wrapped = function (...args) {
            events.push({ phase, plugin: plugin.name, hook: name, environment: this?.environment?.name ?? 'unscoped' })
            return handler.apply(this, args)
          }
          wrapped.original = handler
          plugin[name] = typeof hook === 'function' ? wrapped : { ...hook, handler: wrapped }
        }
      }
    },
  }
}
export function getLifecycleCounts(events) {
  const counts = {}
  for (const event of events) {
    const key = `${event.phase}/${event.plugin}/${event.hook}/${event.environment}`
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}
