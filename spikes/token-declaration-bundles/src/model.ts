type Property = 'color' | 'fontSize' | 'lineHeight' | `--${string}`
type Selector = `${string}&${string}` | `:${string}`
type Leaf = string | number

type InvalidChildren<Tree, Conditions extends string> = {
  [Key in keyof Tree & string]:
  Tree[Key] extends Leaf
    ? Key extends Property ? never : Key
    : Key extends Conditions | Selector ? never : Key
}[keyof Tree & string]

interface ErrorShape<Names extends string> {
  readonly color: {
    readonly [
    Message in `$dec cannot apply ${Names}: navigate to a leaf bundle, or register/use the child as a condition`
    ]: never
  }
}

export type DeclarationBundle<Tree, Conditions extends string>
  = [InvalidChildren<Tree, Conditions>] extends [never]
    ? {
        readonly [Key in keyof Tree & string]:
        Tree[Key] extends Leaf
          ? Tree[Key]
          : Key extends Conditions | Selector
            ? DeclarationBundle<Tree[Key], Conditions>
            : never
      }
    : ErrorShape<InvalidChildren<Tree, Conditions>>

interface Tokens {
  body: {
    fontSize: '1rem'
    lineHeight: 1.5
    hover: { color: 'purple' }
  }
  text: {
    body: { fontSize: '1rem' }
    heading: { fontSize: '2rem' }
  }
}

export type Body = DeclarationBundle<Tokens['body'], 'hover'>
export type InvalidText = DeclarationBundle<Tokens['text'], 'hover'>

const body: Body = {
  fontSize: '1rem',
  lineHeight: 1.5,
  hover: { color: 'purple' },
}

// @ts-expect-error — the namespace error is a named property, not a flattened map
const invalid: InvalidText = { body: { fontSize: '1rem' } }

void body
void invalid
