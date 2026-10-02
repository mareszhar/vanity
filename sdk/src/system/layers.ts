/** The complete order one system establishes wherever its CSS is emitted. */
export function orderSystemLayers(
  prefix: string,
  layers: readonly string[],
  tokenLayer: string | undefined,
  axes: readonly string[],
): readonly string[] {
  const order = [prefix, ...layers.map(layer => `${prefix}.${layer}`)]
  if (tokenLayer !== undefined) {
    const tokenRoot = `${prefix}.${tokenLayer}`
    order.push(`${tokenRoot}.base`, `${tokenRoot}.axes`)
    for (const axis of axes)
      order.push(`${tokenRoot}.axes.${axis}`)
    order.push(`${tokenRoot}.cases`)
  }
  return order
}
