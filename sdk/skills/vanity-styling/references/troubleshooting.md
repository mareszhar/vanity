# Troubleshooting

## Reading a Vanity error

Build and dev-server errors look like this:

```text
VanityError: ✖ VANITY_CSS_INVALID_VALUE  display: 'flexx' does not parse as a display value
    at vanity.display (components/UiCard/UiCard.css.ts:4:12)
  fix: give display a value its grammar accepts
```

The code names the failure class, the path names the property (`vanity.display`, or `button.variants.intent.primary.color`), the frame points at your source, and `fix:` is the repair. Errors inside one `class()`/`recipe()` call are reported together; the build then stops at that module, so re-run after each fix.

| Code | Usual cause | Fix |
| --- | --- | --- |
| `VANITY_CSS_INVALID_VALUE` | a value the CSS grammar rejects | correct the value; for future syntax use the raw at-rule/selector form |
| `VANITY_CSS_UNKNOWN_PROPERTY` | a misspelled property, or a key you meant as a condition | follow the "did you mean"; register the condition in the system if it's a state |
| `VANITY_CSS_INVALID_SELECTOR` | an unparsable selector key, or a non-string used as a key | write the selector as a string with `&`, or use a named condition |
| `VANITY_CSS_INVALID_KEY` | a selector key whose value isn't a nested rule, or an unsupported at-rule | nest an object, or move the at-rule into `raw()` |
| `VANITY_SYSTEM_IN_STYLE_MODULE` | `createSystem`/`consolidate` inside `*.css.ts` | keep the system in its plain `.ts` module |
| `VANITY_AUTHORING_IN_APP_MODULE` | a component or composable imports `@mszr/vanity` | use `ds` / style handles; authoring belongs in `*.css.ts` or the system module |
| `VANITY_APP_EXPORT_IN_SYSTEM_MODULE` | the system module exports something that isn't the system or taken from it | move that export to another module |
| `VANITY_TOKENS_INVALID_DEFINITION` | malformed token definition (see `vanity-system`) | follow the message |

TypeScript errors with `Did you mean 'ink'?` are token typos; `Object literal may only specify known properties, and 'hovr' does not exist` means an unknown key — check the system's condition names.

## "My style doesn't apply"

Work through these in order:

1. **Is the class bound?** Inspect the element: the generated class (`UiCard_card__x1y2`, hashed in production) must be in `class`. A forgotten `s.` or a recipe referenced without calling it (`s.button` instead of `s.button(props)`) is the usual culprit.
2. **Is the condition true?** `open` needs `data-state="open"` on that same element (or on the root part, for `'root:open'`). Check the attribute in the DOM.
3. **Is something winning the cascade?** Vanity emits into cascade layers (`app.reset`, `app.tokens`, `app.recipes`, `app.utilities`, `app.overrides`, named after the system prefix). **Unlayered CSS beats every layer** — a global stylesheet or a third-party library without layers will override component classes regardless of specificity. No Vanity layer can beat it for normal declarations, `overrides` included: the fix is to put the competing stylesheet into a layer ordered *below* Vanity's (setup skill §4, `compiler.layerOrder`). Between Vanity's own layers, a later layer wins regardless of specificity (`ds.inLayer('overrides')` beats a recipe); inside one layer, specificity and source order apply. `!important` reverses layer order (an important declaration in an *earlier* layer wins), so it's rarely the fix you want.
4. **Is the token what you think?** `ds.explain(t.color.accent)` (in a script or test) or `npx vanity explain color.accent <path-to>/.vanity/manifest.json` shows the authored expression, emitted declarations per theme/mode, and dependencies.
5. **Is the dev server stale?** After changing Vanity's version or the build config, stop and restart the dev server; a running server keeps old compiler code.

## "The theme/value doesn't switch at runtime"

- Only tokens declared `mutable: true` accept `$set`; only axis modes written with an activatable helper (`data(…)`, `colorSchemes()`) accept `$switchTo`. See `vanity-system`.
- An axis only takes effect where some token varies on it.
- Runtime writes go to private slots; never set `--app-*` properties by hand, they won't win.

## Reporting a Vanity bug

If behavior contradicts the error message, the types, or this skill, it may be a Vanity bug. Reduce it to the smallest `system.ts` + `*.css.ts` that reproduces it, note the Vanity version (`node_modules/@mszr/vanity/package.json`), and report it to the maintainer instead of working around it silently. If the repo vendors Vanity's source (often under `__references__/vanity`), its `docs/reference/` specs define the intended behavior.
