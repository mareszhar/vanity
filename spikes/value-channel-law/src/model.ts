export interface LogicalReference {
  readonly path: string
}

interface ReferenceNode {
  readonly kind: 'reference'
  readonly path: string
}

interface LiteralNode {
  readonly kind: 'literal'
  readonly value: number
}

interface OperationNode {
  readonly kind: 'operation'
  readonly operator: '+' | '-' | '*' | '/'
  readonly left: RelativeNode
  readonly right: ReferenceNode | LiteralNode
}

interface ChannelNode {
  readonly kind: 'channel'
}

type RelativeNode = ChannelNode | OperationNode

export interface RelativeChannel {
  readonly node: RelativeNode
  add: (value: LogicalReference | number) => RelativeChannel
  subtract: (value: LogicalReference | number) => RelativeChannel
  multiply: (value: LogicalReference | number) => RelativeChannel
  divide: (value: LogicalReference | number) => RelativeChannel
}

export function reference(path: string): LogicalReference {
  return Object.freeze({ path })
}

export function channel() {
  const start = make({ kind: 'channel' })
  return Object.freeze({
    add: start.add,
    subtract: start.subtract,
    multiply: start.multiply,
    divide: start.divide,
  })
}

export function serialize(
  expression: RelativeChannel,
  resolve: (path: string) => string,
): string {
  return `calc(${serializeNode(expression.node, resolve)})`
}

function make(node: RelativeNode): RelativeChannel {
  const operation = (
    operator: OperationNode['operator'],
    value: LogicalReference | number,
  ) => make({
    kind: 'operation',
    operator,
    left: node,
    right: typeof value === 'number'
      ? { kind: 'literal', value }
      : { kind: 'reference', path: value.path },
  })

  return Object.freeze({
    node,
    add: (value: LogicalReference | number) => operation('+', value),
    subtract: (value: LogicalReference | number) => operation('-', value),
    multiply: (value: LogicalReference | number) => operation('*', value),
    divide: (value: LogicalReference | number) => operation('/', value),
  })
}

function serializeNode(
  node: RelativeNode | ReferenceNode | LiteralNode,
  resolve: (path: string) => string,
): string {
  if (node.kind === 'channel')
    return 'channel'
  if (node.kind === 'reference')
    return `var(${resolve(node.path)})`
  if (node.kind === 'literal')
    return String(node.value)
  return `(${serializeNode(node.left, resolve)} ${node.operator} ${serializeNode(node.right, resolve)})`
}
