import { performance } from 'node:perf_hooks'
import { inspectDeclaration } from './model.mjs'

/** The independent fixture records authored cases as explicit mode products. */
export function enumerateEnvironments({ schemes = ['light', 'dark'], axes, when = {}, subtree = {} }) {
  const dimensions = [['scheme', schemes], ...Object.entries(axes)]
  let states = [{ modes: {}, subtree }]
  for (const [name, values] of dimensions) {
    const modes = when[name] === undefined ? values : values.filter(value => value === when[name])
    states = states.flatMap(state => modes.map(value => ({ ...state, modes: { ...state.modes, [name]: value } })))
  }
  return states.map(state => ({ ...state, id: Object.entries(state.modes).map(([key, value]) => `${key}=${value}`).join(';') }))
}

export function resolveFixtureValue(token, state) {
  if (Object.hasOwn(state.subtree, token.path))
    return state.subtree[token.path]
  let value = token.base
  for (const branch of token.cases) {
    if (Object.entries(branch.when).every(([key, mode]) => state.modes[key] === mode))
      value = branch.value
  }
  return value
}

export function measureEnvironmentProduct() {
  const states = enumerateEnvironments({ axes: {
    density: ['base', 'compact', 'spacious'],
    skin: ['calm', 'crisp', 'playful'],
    motion: ['full', 'reduced', 'none'],
    size: ['small', 'medium', 'large'],
  } })
  const start = performance.now()
  const memo = new Map()
  let observations = 0
  for (let index = 0; index < 5000; index++) {
    for (const state of states) {
      const value = `${state.modes.density === 'compact' ? index % 17 : index % 23}px`
      if (!memo.has(value))
        memo.set(value, inspectDeclaration('padding', value))
      observations++
    }
  }
  return { declarations: 5000, environments: states.length, observations, distinctValues: memo.size, wallMs: performance.now() - start }
}
