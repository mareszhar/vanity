# Can the existing CSS parser establish complete identifier consumption and decoded identity?

Layer and axis names become CSS layer names and selectors, so a name the browser would only partly consume silently drops rules. This spike checks whether the CSS parser alone can say that a spelling is one complete identifier and what it decodes to, without a private grammar. It imports no Vanity code.

**Verdict:** yes, with two independent parses per spelling.

## Run

Use the workspace-pinned Node and pnpm. From this directory:

```sh
pnpm install --ignore-workspace
pnpm test
```

## Setup

lightningcss parses the spelling twice, in separate contexts: once as a raw unknown at-rule token, and once inside a qualified `parent.<name>.suffix` layer statement followed by a sentinel style rule. Assertions compare decoded identity and require complete consumption. Keeping the contexts apart stops injected rules from impersonating the expected layer and sentinel.

## Observed result

All 18 invalid and 10 valid spellings pass the expected token, parent/suffix, and sentinel checks. Unknown at-rule tokens retain comments, and dashed identifiers have a dedicated AST variant.

| Observation | Result |
| --- | --- |
| 18 invalid spellings | Rejected, including comments, EOF syntax, injected surrounding rules, null/replacement and dots |
| 10 valid spellings | Accepted with the expected decoded identity |
| Hex escape terminator | Whitespace belongs to the escape without consuming the suffix |
| Dashed identifiers | Dedicated AST token variant is recognized |

## Limits and footguns

This isolates platform parsing. Public registration diagnostics and browser selector and runtime carriers need separate integration evidence.
