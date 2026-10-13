// Independent prototype; run with browser.mjs in this directory.
export function inferVariant(classes, recipe, part = 'root', binding) {
  if (binding) {
    const validated = validateSelection(recipe, binding)
    if (validated.errors.length === 0)
      return { selection: validated.selection, evidence: 'binding' }
    return { selection: {}, evidence: 'partial', errors: validated.errors }
  }
  const axes = Object.entries(recipe.variants)
  let candidates = [{}]
  for (const [axis, arms] of axes) {
    const choices = Object.keys(arms)
    if (!Object.hasOwn(recipe.defaults, axis))
      choices.push(undefined)
    candidates = candidates.flatMap(previous => choices.map(value => ({ ...previous, ...(value === undefined ? {} : { [axis]: value }) })))
  }
  for (const toggle of Object.keys(recipe.toggles ?? {}))
    candidates = candidates.flatMap(previous => [false, true].map(value => ({ ...previous, [toggle]: value })))
  const owned = new Set([...(recipe.base[part] ?? []), ...axes.flatMap(([, arms]) => Object.values(arms).flatMap(arm => arm[part] ?? [])), ...Object.values(recipe.toggles ?? {}).flatMap(arm => arm[part] ?? []), ...(recipe.compound ?? []).flatMap(arm => arm.classes[part] ?? [])])
  const observed = new Set(classes.filter(name => owned.has(name)))
  candidates = candidates.filter((candidate) => {
    const expected = new Set([...(recipe.base[part] ?? []), ...axes.flatMap(([axis, arms]) => arms[candidate[axis]]?.[part] ?? []), ...Object.entries(recipe.toggles ?? {}).flatMap(([toggle, arm]) => candidate[toggle] ? arm[part] ?? [] : []), ...(recipe.compound ?? []).filter(arm => Object.entries(arm.when).every(([key, value]) => candidate[key] === value)).flatMap(arm => arm.classes[part] ?? [])])
    return observed.size === expected.size && [...expected].every(name => observed.has(name))
  })
  const selection = {}
  for (const axis of [...axes.map(([name]) => name), ...Object.keys(recipe.toggles ?? {})]) {
    const values = new Set(candidates.map(candidate => candidate[axis]))
    if (values.size === 1 && !values.has(undefined))
      selection[axis] = [...values][0]
  }
  return { selection, evidence: candidates.length === 1 ? 'classes' : 'partial', candidates: candidates.length }
}

export function validateSelection(recipe, props) {
  const selection = {}
  const errors = []
  for (const [key, value] of Object.entries(props)) {
    if (!(key in recipe.variants) && !(key in (recipe.toggles ?? {})))
      errors.push(`Unknown selection: ${key}`)
    else if (value !== undefined && value !== null && (key in recipe.variants ? !Object.hasOwn(recipe.variants[key], value) : typeof value !== 'boolean'))
      errors.push(`Invalid selection: ${key}=${String(value)}`)
  }
  for (const [key, arms] of Object.entries(recipe.variants)) {
    const value = props[key] ?? recipe.defaults[key]
    if (value !== undefined && Object.hasOwn(arms, value))
      selection[key] = value
    else if (value !== undefined)
      errors.push(`Invalid default: ${key}=${String(value)}`)
  }
  for (const key of Object.keys(recipe.toggles ?? {})) selection[key] = props[key] ?? recipe.defaults[key] ?? false
  return { selection, errors }
}

export function inspectElement(element, manifest) {
  const classes = [...element.classList]
  const sources = manifest.styles.filter(style => classes.includes(style.class))
  return sources.map((source) => {
    const recipe = manifest.recipes[source.export]
    let root = element
    if (recipe.parts && source.part !== 'root') {
      root = element.parentElement
      while (root && !(recipe.base.root ?? []).every(name => root.classList.contains(name))) root = root.parentElement
    }
    const binding = root?.dataset.vanityVariant ? JSON.parse(root.dataset.vanityVariant) : undefined
    const variant = root ? inferVariant([...root.classList], recipe, root === element ? source.part : 'root', binding) : inferVariant(classes, recipe, source.part)
    return { ...source, variant, root: root?.id ?? null, association: root === element ? 'self' : root ? 'ancestor' : 'missing' }
  })
}

export function inspectInstance(element) {
  const key = element.getAttribute('data-vanity-key')
  const text = element.textContent.trim().slice(0, 120)
  const candidates = key ? [...document.querySelectorAll('[data-vanity-key]')].filter(other => other.getAttribute('data-vanity-key') === key) : [...document.querySelectorAll(element.tagName)].filter(other => other.textContent.trim().slice(0, 120) === text)
  const index = [...element.parentElement.children].indexOf(element) + 1
  const segments = []
  for (let current = element; current && current !== document.body; current = current.parentElement) segments.unshift(`${current.tagName.toLowerCase()}:nth-child(${[...current.parentElement.children].indexOf(current) + 1})`)
  return { ...(key ? { key } : {}), strength: candidates.length > 1 ? 'ambiguous' : key ? 'app-key' : 'locator', candidates: candidates.length, route: location.pathname, path: segments.join(' > '), index, text }
}
