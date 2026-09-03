/**
 * The DevTools view over the manifest ([spec-vue.md §4]): a token browser
 * (values per scheme, liveness, usage), the recipe/anatomy inspector, ports,
 * conditions, and the escape inventory — served by the `/vite` plugin at
 * `/__vanity/` and embedded by the Nuxt module as a DevTools tab. One
 * self-contained page, no build step: it reads `/__vanity/manifest.json` and
 * re-renders when the manifest changes.
 */

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>vanity</title>
<style>
  :root {
    color-scheme: light dark;
    --ink: light-dark(oklch(0.25 0.01 285), oklch(0.92 0.01 285));
    --soft: light-dark(oklch(0.55 0.02 285), oklch(0.72 0.02 285));
    --line: light-dark(oklch(0.92 0.005 285), oklch(0.28 0.01 285));
    --card: light-dark(oklch(0.985 0.002 285), oklch(0.21 0.008 285));
    --accent: oklch(0.58 0.2 285);
    --mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box }
  body {
    margin: 0; padding: 1.25rem 1.5rem 3rem; color: var(--ink);
    background: light-dark(#fff, oklch(0.17 0.006 285));
    font: 400 0.875rem/1.5 system-ui, sans-serif;
  }
  h1 { font-size: 1rem; margin: 0; display: flex; align-items: baseline; gap: 0.6rem }
  h1 small { color: var(--soft); font-weight: 400 }
  h2 { font-size: 0.8125rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--soft); margin: 2rem 0 0.5rem }
  table { border-collapse: collapse; width: 100% }
  th, td { text-align: left; padding: 0.3rem 0.75rem 0.3rem 0; border-bottom: 1px solid var(--line); vertical-align: baseline }
  th { color: var(--soft); font-weight: 500; font-size: 0.75rem }
  code, .mono { font-family: var(--mono); font-size: 0.8125rem }
  .swatch { display: inline-block; inline-size: 0.85em; block-size: 0.85em; border-radius: 3px; border: 1px solid var(--line); vertical-align: -0.08em; margin-inline-end: 0.45em }
  .badge { font: 500 0.6875rem/1 var(--mono); padding: 0.2em 0.5em; border-radius: 999px; border: 1px solid var(--line); color: var(--soft) }
  .badge.live { color: var(--accent); border-color: color-mix(in oklab, var(--accent), transparent 55%) }
  .dim { color: var(--soft) }
  .chip { display: inline-block; font-family: var(--mono); font-size: 0.75rem; background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 0.1em 0.5em; margin: 0.1em 0.25em 0.1em 0 }
  .file { color: var(--soft); font-size: 0.75rem; text-decoration: none; font-family: var(--mono) }
  .file:hover { color: var(--accent); text-decoration: underline }
  .empty { color: var(--soft); padding: 1.5rem 0; text-align: center }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr)); gap: 0.75rem }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 0.75rem 0.9rem }
  .card h3 { margin: 0 0 0.4rem; font-size: 0.875rem; display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem }
  .card .axis { color: var(--soft); font-size: 0.75rem; margin-top: 0.35rem }
  ul { margin: 0; padding: 0; list-style: none }
  li { padding: 0.3rem 0; border-bottom: 1px solid var(--line) }
  li .reason { color: var(--soft); font-style: italic }
</style>
</head>
<body>
<h1>vanity <small id="counts"></small></h1>
<main id="app"><div class="empty">reading the manifest…</div></main>
<script>
const ROOT = __VANITY_ROOT__
let last = ''

const esc = (text) => String(text).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function fileLink(file, line, column) {
  if (!file) return ''
  const name = file.split('/').pop()
  const position = line ? ':' + line + (column ? ':' + column : '') : ''
  return '<a class="file" href="#" data-file="' + esc(file) + '" data-line="' + esc(line ?? '')
    + '" data-column="' + esc(column ?? '') + '">' + esc(name + position) + '</a>'
}

function sourceLink(entry) {
  const source = entry?.declaredAt
  return fileLink(source?.file, source?.line, source?.column)
}

function swatch(value) {
  return '<span class="swatch" style="background:' + esc(value) + '"></span>'
}

function isColorish(value) {
  return /^(#|oklch|oklab|rgb|hsl|hwb|lab|lch|color\\(|light-dark|white$|black$)/.test(value)
}

function tokenRow(path, token) {
  const resolved = token.preview.status === 'resolved'
    ? token.preview.val
    : token.expression.css ?? token.declarations.find((declaration) => declaration.val !== null)?.val
  const value = resolved
    ? (isColorish(resolved) ? swatch(resolved) : '') + '<span class="mono">' + esc(resolved) + '</span>'
    : '<span class="dim">' + esc(token.preview.reason ?? 'no resolved preview') + '</span>'

  const explanation = '<details><summary>' + esc(token.expression.kind) + ' · ' + esc(token.fold.status) + '</summary>'
    + '<div class="axis">name</div><code>' + esc(token.name ?? 'not emitted') + '</code>'
    + '<div class="axis">dependencies</div>'
    + (token.dependencies.length ? token.dependencies.map((edge) => '<span class="chip">' + esc(edge.path ?? edge.name ?? edge.kind) + '</span>').join('') : '<span class="dim">none</span>')
    + '<div class="axis">contexts</div>'
    + token.declarations.map((declaration) => '<div><span class="badge">' + esc(declaration.kind) + '</span> <code>'
      + esc(['root ' + declaration.context.root, declaration.context.layer ? '@layer ' + declaration.context.layer : '', ...declaration.context.atRules, ...declaration.context.selectors].filter(Boolean).join(' '))
      + '</code></div>').join('') + '</details>'

  return '<tr><td><code>' + esc(path) + '</code></td><td>' + value + '</td>'
    + '<td><span class="badge' + (token.mutable ? ' live' : '') + '">' + esc(token.type) + '</span> '
    + '<span class="badge">' + esc(token.reference) + (token.mutable ? ' · mutable' : '') + '</span></td>'
    + '<td class="dim">' + token.usage + '</td>'
    + '<td class="dim">' + esc(token.description ?? '')
    + (token.deprecated ? ' <em>deprecated: ' + esc(token.deprecated) + '</em>' : '')
    + ' <span class="badge">' + token.declarations.length + ' declarations</span>' + explanation
    + (token.portability.status === 'nonportable' ? ' <span class="badge">nonportable</span>' : '') + '</td>'
    + '<td>' + sourceLink(token) + '</td></tr>'
}

function recipeCard(name, recipe) {
  const axes = Object.entries(recipe.variants)
    .map(([axis, values]) => '<div class="axis">' + esc(axis) + '</div>'
      + values.map((v) => '<span class="chip">' + esc(v) + (recipe.defaults[axis] === v ? ' ✓' : '') + '</span>').join(''))
    .join('')
  const toggles = recipe.toggles.length
    ? '<div class="axis">toggles</div>' + recipe.toggles.map((t) => '<span class="chip">' + esc(t) + '</span>').join('')
    : ''
  const parts = recipe.parts
    ? '<div class="axis">parts</div>' + recipe.parts.map((p) => '<span class="chip">' + esc(p) + '</span>').join('')
    : ''
  const ports = Object.keys(recipe.ports).length
    ? '<div class="axis">ports</div>' + Object.keys(recipe.ports).map((p) => '<span class="chip">' + esc(p) + '</span>').join('')
    : ''

  return '<div class="card"><h3><code>' + esc(name) + '</code>' + sourceLink(recipe) + '</h3>'
    + parts + axes + toggles + ports + '</div>'
}

function render(manifest) {
  const modules = Object.values(manifest.modules)
  const usage = Object.assign({}, ...modules.map((module) => module.tokenUsage))
  const tokens = Object.entries(manifest.system.tokens).map(([path, token]) => [path, { ...token, usage: usage[path] ?? 0 }])
  const recipes = modules.flatMap((module) => Object.entries(module.recipes).map(([name, recipe]) => [module.source + ':' + name, recipe]))
  const ports = modules.flatMap((module) => Object.entries(module.ports))
  const styles = modules.flatMap((module) => Object.entries(module.styles))
  const escapes = modules.flatMap((module) => module.escapes)
  const contrast = modules.flatMap((module) => module.contrast)

  document.getElementById('counts').textContent
    = tokens.length + ' tokens · ' + styles.length + ' styles · ' + recipes.length + ' recipes · ' + ports.length + ' ports'

  const sections = []

  sections.push('<h2>Tokens</h2>')
  sections.push(tokens.length
    ? '<table><tr><th>token</th><th>resolved preview</th><th>type / traits</th><th>usage</th><th>provenance</th><th>source</th></tr>'
      + tokens.map(([path, token]) => tokenRow(path, token)).join('') + '</table>'
    : '<div class="empty">no tokens yet</div>')

  if (recipes.length) {
    sections.push('<h2>Recipes &amp; anatomies</h2><div class="cards">'
      + recipes.map(([name, recipe]) => recipeCard(name, recipe)).join('') + '</div>')
  }

  if (styles.length) {
    sections.push('<h2>Class provenance</h2><table><tr><th>class</th><th>tokens</th><th>source</th></tr>'
      + styles.map(([className, style]) =>
        '<tr><td><code>.' + esc(className) + '</code>' + (style.name ? ' <span class="dim">' + esc(style.name) + '</span>' : '') + '</td>'
        + '<td>' + style.tokens.map((token) => '<span class="chip">' + esc(token) + '</span>').join('') + '</td>'
        + '<td>' + sourceLink(style) + '</td></tr>').join('')
      + '</table>')
  }

  if (ports.length) {
    sections.push('<h2>Ports</h2><table><tr><th>port</th><th>type</th><th>default</th><th></th><th></th></tr>'
      + ports.map(([name, port]) =>
        '<tr><td><code>' + esc(name) + '</code></td><td><span class="badge">' + esc(port.type) + '</span></td>'
        + '<td class="mono">' + esc(port.default) + (port.unit ? '<span class="dim">' + esc(port.unit) + '</span>' : '') + '</td>'
        + '<td class="dim">' + esc(port.description ?? '') + '</td>'
        + '<td>' + sourceLink(port) + '</td></tr>').join('')
      + '</table>')
  }

  const conditions = Object.entries(manifest.system.conditions)
  if (conditions.length) {
    sections.push('<h2>Conditions</h2><table>'
      + conditions.map(([name, condition]) =>
        '<tr><td style="width:12rem"><code>' + esc(name) + '</code></td><td class="mono dim">' + esc(condition.readable)
        + '<div class="dim">' + esc(JSON.stringify(condition.arms)) + '</div></td></tr>').join('')
      + '</table>')
    sections.push('<h2>Layers</h2><div>' + manifest.system.layers.map((l) => '<span class="chip">' + esc(l.name) + '</span>').join(' <span class="dim">→</span> ') + '</div>')
  }

  if (escapes.length) {
    sections.push('<h2>Escape inventory</h2><ul>'
      + escapes.map((escape) =>
        '<li><span class="badge">' + esc(escape.form) + '</span> <span class="mono">' + esc(escape.detail) + '</span>'
        + (escape.reason ? ' <span class="reason">— ' + esc(escape.reason) + '</span>' : '')
        + ' ' + sourceLink(escape) + '</li>').join('')
      + '</ul>')
  }

  if (contrast.length) {
    sections.push('<h2>Contrast</h2><table><tr><th>pairing</th><th>scheme</th><th>measured</th><th>min</th><th></th></tr>'
      + contrast.map((entry) =>
        '<tr><td><code>' + esc(entry.pairing) + '</code></td><td class="dim">' + esc(entry.scheme) + '</td>'
        + '<td class="mono">' + entry.measured + '</td><td class="mono dim">' + entry.min + '</td>'
        + '<td>' + (entry.accepted ? '<span class="badge">accepted</span>' : '<span class="badge live">✓</span>') + '</td></tr>').join('')
      + '</table>')
  }

  document.getElementById('app').innerHTML = sections.join('')
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('[data-file]')
  if (!link) return
  event.preventDefault()
  const position = link.dataset.line ? ':' + link.dataset.line + (link.dataset.column ? ':' + link.dataset.column : '') : ''
  fetch('/__open-in-editor?file=' + encodeURIComponent(ROOT + '/' + link.dataset.file + position))
})

async function refresh() {
  try {
    const response = await fetch('/__vanity/manifest.json')
    const text = await response.text()
    if (text !== last) {
      last = text
      render(JSON.parse(text))
    }
  }
  catch {}
}

refresh()
setInterval(refresh, 1500)
</script>
</body>
</html>
`

/** The page, with the project root inlined so file links can open in the editor. */
export function renderDevtoolsPage(root: string): string {
  return PAGE.replace('__VANITY_ROOT__', JSON.stringify(root))
}
