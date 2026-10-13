// SDK-independent geometry prototype; run.mjs exercises its measurements.
function seen(element, axis = 'vertical') {
  const box = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  const fallback = reason => ({ top: box.top, bottom: box.bottom, estimated: true, reason })
  let ancestor = element
  while (ancestor) {
    const current = getComputedStyle(ancestor)
    if (current.transform !== 'none' || current.translate !== 'none' || current.rotate !== 'none' || current.scale !== 'none')
      return fallback('transform')
    if (ancestor !== element && ['hidden', 'clip', 'scroll', 'auto'].includes(current.overflowY)) {
      const clip = ancestor.getBoundingClientRect()
      if (box.top < clip.top + ancestor.clientTop || box.bottom > clip.top + ancestor.clientTop + ancestor.clientHeight)
        return fallback('overflow clipping')
    }
    ;

    ancestor = ancestor.parentElement
  }
  if (element instanceof HTMLImageElement)
    return fallback('image pixels')
  if (style.position === 'absolute' || style.position === 'fixed')
    return fallback('absolute position')
  const visibleColor = color => color !== 'transparent' && !/rgba\([^)]*,\s*0\s*\)/.test(color) && !/\/\s*0\s*\)/.test(color)
  for (const pseudo of ['::before', '::after']) {
    const p = getComputedStyle(element, pseudo)
    if (!['none', 'normal'].includes(p.content))
      return fallback('decorative pseudo-element')
  }
  if (style.backgroundImage !== 'none')
    return fallback('image background')
  const border = ['Top', 'Right', 'Bottom', 'Left'].some(side => Number.parseFloat(style[`border${side}Width`]) > 0 && !['none', 'hidden'].includes(style[`border${side}Style`]) && visibleColor(style[`border${side}Color`]))
  const surface = visibleColor(style.backgroundColor) || border || (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0 && visibleColor(style.outlineColor)) || style.boxShadow !== 'none'
  if (surface)
    return { top: box.top, bottom: box.bottom, estimated: false, surface: true }
  const parts = []
  for (const node of element.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const child = seen(node, axis)
      if (child.estimated)
        return fallback(child.reason)
      parts.push(child)
    }
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      const range = document.createRange()
      range.selectNodeContents(node)
      const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0).sort((a, b) => a.top - b.top)
      if (!rects.length)
        return fallback('no measurable ink')
      if (axis === 'horizontal' && rects.length > 1)
        return fallback('ragged wrapped text on cross axis')
      const ctx = document.createElement('canvas').getContext('2d')
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      const font = ctx.measureText('H')
      if (!Number.isFinite(font.fontBoundingBoxAscent))
        return fallback('font metrics')
      const firstBaseline = rects[0].top + font.fontBoundingBoxAscent
      const lastBaseline = rects.at(-1).top + font.fontBoundingBoxAscent
      const dpr = devicePixelRatio
      parts.push({ top: Math.floor((firstBaseline - font.actualBoundingBoxAscent) * dpr) / dpr, bottom: Math.ceil(lastBaseline * dpr) / dpr })
    }
  }
  if (!parts.length)
    return fallback('no measurable ink')
  const top = Math.min(...parts.map(p => p.top))
  const bottom = Math.max(...parts.map(p => p.bottom))
  if (['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowY) && (top < box.top + element.clientTop || bottom > box.top + element.clientTop + element.clientHeight))
    return fallback('overflow clipping')
  return { top, bottom, estimated: false, surface: false }
}
export {
  seen,
}
