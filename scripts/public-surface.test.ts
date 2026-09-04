import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

interface AllowlistGroup {
  readonly reason: string
  readonly names: readonly string[]
}

/**
 * Inputs and choice vocabularies must explain themselves at the declaration;
 * a rendered name or literal union is not a substitute for author guidance.
 */
const NEVER_ALLOWLISTED_NAMES = new Set([
  'VanityAuditKind',
  'VanityAuditLevel',
  'VanityColorInterpolationSpace',
  'VanityDtcgExportMode',
  'VanityExpressionKind',
  'VanityInvalidRuntimeValuePolicy',
  'VanityPropertyAliasExposure',
  'VanityRuntimeValidationMode',
  'VanityTokenHandleAny',
])

/** Public object contracts whose members are authored or supplied by users. */
const MEMBER_DOCUMENTATION_NAMES = new Set([
  'VanityAxisControl',
  'VanityAxisControlRoot',
  'VanityAxisTriggerArm',
  'VanityConstructorRestriction',
  'VanityCssOperationDefinition',
  'VanityCssValueDefinition',
  'VanityDtcgCodec',
  'VanityDtcgDecodeContext',
  'VanityNativeSchemePolicy',
  'VanityPolicies',
  'VanityStandardSchemaV1',
  'VanityTokenCase',
  'VanityTokenPolicies',
  'VanityTokenRegistration',
  'VanityTokenValidation',
])

/**
 * Long-tail exports whose literal grammar or established CSS spelling is the
 * documentation: the public name and rendered type already state their whole
 * contract. Happy-path and integration-facing types are documented at their
 * declarations and are deliberately absent from this allowlist.
 */
const SELF_DESCRIBING_GROUPS: readonly AllowlistGroup[] = [
  {
    reason: 'CSS grammar aliases mirror the CSS names and remain readable in a rendered type.',
    names: [
      'VanityAtRules',
      'VanityCssPropertyName',
      'VanityDeclarations',
      'VanityFontFaceFunction',
      'VanityFontFaceRule',
      'VanityFragment',
      'VanityKeyframesFunction',
      'VanityKeyframesRule',
      'VanityKeyframeTime',
      'VanityRawEmitter',
      'VanityRawValue',
      'VanityAtomInput',
    ],
  },
  {
    reason: 'Diagnostic and audit record helpers are self-describing structural carriers.',
    names: [
      'VanityDiagnosticFix',
      'VanityDiagnosticRelated',
      'VanityDiagnosticRelatedInput',
      'VanityDiagnosticSink',
    ],
  },
  {
    reason: 'DTCG record aliases expose the external document vocabulary directly.',
    names: [
      'VanityDtcgAuthoredExtension',
      'VanityDtcgAuthoredToken',
      'VanityDtcgEncodedValue',
    ],
  },
  {
    reason: 'Explanation records are direct data carriers whose names state their role.',
    names: [
      'VanityExplanation',
      'VanityTokenExplanation',
    ],
  },
  {
    reason: 'Port value aliases and metadata projections are direct CSS/runtime vocabulary.',
    names: [
      'VanityPortDataTypeOf',
      'VanityPortDecValue',
      'VanityPortDefault',
      'VanityPortDefinition',
      'VanityPortFactory',
      'VanityPortInput',
      'VanityPortMeta',
      'VanityPortStyle',
      'VanityPortValidationMeta',
      'VanityPortValue',
      'VanityTokenGroup',
    ],
  },
  {
    reason: 'Anatomy rule aliases are the direct conditional rule grammar used at a part key.',
    names: ['VanityAnatomyRule', 'VanityAnatomyRuleInput'],
  },
  {
    reason: 'Axis and condition grammar aliases render as their finite authoring vocabulary.',
    names: [
      'VanityAxisAuthoringHelpers',
      'VanityAxisDefinition',
      'VanityAxisDefinitions',
      'VanityAxisModeInput',
      'VanityAxisName',
      'VanityAxisTrigger',
      'VanityAxisTriggerArm',
      'VanityDefaultAxisMode',
      'VanityOpenAxisModes',
      'VanityBaseConditionInputs',
      'VanityBaseConditionName',
      'VanityConditionAst',
      'VanityConditionInput',
      'VanityConditionKeyFor',
      'VanityConditionKeys',
      'VanityConditionScalar',
      'VanityFluentCondition',
      'VanityRangeQuery',
      'VanityScopeCondition',
      'VanityStructuredQuery',
    ],
  },
  {
    reason: 'System definition and module plumbing aliases directly name the supplied shape.',
    names: [
      'VanityConstructorDefinition',
      'VanityConstructorFamily',
      'VanityConstructorMembers',
      'VanityUtilTree',
      'VanityDefaultLayers',
      'VanitySystemConditionName',
      'VanityAxisModuleInput',
      'VanityDefinitionModule',
      'VanityAxisPatch',
      'VanitySystemRule',
      'VanityTokenAxisMethods',
      'VanityTokenDefinitionValue',
      'VanityTokenTreeGraph',
    ],
  },
  {
    reason: 'The check helper and color grammar use established CSS function/channel names.',
    names: [
      'check',
      'VanityChannelOperation',
      'VanityColorChannel',
      'VanityColorFunction',
      'VanityColorFunctionChannels',
      'VanityColorMixItem',
      'VanityColorMixPercentage',
      'VanityCssColorSpace',
      'VanityHslChannels',
      'VanityHslFunction',
      'VanityHueChannel',
      'VanityHwbChannels',
      'VanityHwbFunction',
      'VanityImage',
      'VanityLabChannels',
      'VanityLabFunction',
      'VanityLchChannels',
      'VanityLchFunction',
      'VanityLightDarkImage',
      'VanityNumericColorChannel',
      'VanityOklabChannels',
      'VanityOklabFunction',
      'VanityOklchChannels',
      'VanityOklchFunction',
      'VanityPredefinedColorSpace',
      'VanityRgbChannels',
      'VanityRgbFunction',
    ],
  },
  {
    reason: 'The scale value is a callable CSS scale projection with a self-describing name.',
    names: ['scale', 'VanityScale'],
  },
  {
    reason: 'Token model aliases are direct projections of authored values, traits, and handle names.',
    names: [
      'VanityAuthoredInterpolatedColor',
      'VanityCheck',
      'VanityColorTokenHandle',
      'VanityConfiguredToken',
      'VanityHueInterpolation',
      'VanityNamesOf',
      'VanityPolarColorSpace',
      'VanityResolvedTokens',
      'VanityTokenBranchHandle',
      'VanityTokenCase',
      'VanityTokenFactory',
      'VanityTokenFallback',
      'VanityTokenMetadata',
      'VanityTokenMetadataValue',
      'VanityTokens',
      'VanityTokenValidation',
      'VanityTypedNoDefaultTokenFactory',
      'VanityVarsOf',
      'VanityCustomProperty',
    ],
  },
  {
    reason: 'Core value constructors are established CSS function names whose signatures provide the contract.',
    names: [
      'alpha',
      'angle',
      'calc',
      'channel',
      'clamp',
      'color',
      'colorMix',
      'customProperty',
      'darken',
      'desaturate',
      'displayP3',
      'flex',
      'fluid',
      'frequency',
      'grid',
      'hsl',
      'hwb',
      'integer',
      'interpolate',
      'lab',
      'lch',
      'legibleOn',
      'lightDark',
      'lighten',
      'max',
      'min',
      'mix',
      'number',
      'oklab',
      'oklch',
      'percent',
      'rawValue',
      'resolution',
      'rgb',
      'rotate',
      'saturate',
      'time',
    ],
  },
  {
    reason: 'Extension, interpolation, and math aliases state their input/output grammar in their names and type.',
    names: [
      'VanityExtensionInput',
      'VanityInterpolationDimension',
      'VanityCalc',
      'VanityDimensionOf',
      'VanityMathDimension',
      'VanityMathValue',
      'VanityProductDimension',
      'VanityQuotientDimension',
      'VanitySumDimension',
    ],
  },
  {
    reason: 'Portable value protocol aliases are direct discriminators and structural context records.',
    names: [
      'VanityCssFeature',
      'VanityExtensionIdentity',
      'VanityFoldContext',
      'VanityFoldRefusal',
      'VanityFoldResult',
      'VanityReference',
      'VanitySerializeContext',
      'VanitySource',
      'VanityRawValueConstructors',
      'VanityDataTypeOf',
    ],
  },
  {
    reason: 'Unit constructors and unit values are the literal CSS unit vocabulary exposed by the package.',
    names: [
      'length',
      'VanityAngleConstructor',
      'VanityAngleUnit',
      'VanityFlexConstructor',
      'VanityFlexUnit',
      'VanityFrequencyConstructor',
      'VanityFrequencyUnit',
      'VanityLengthConstructor',
      'VanityLengthUnit',
      'VanityResolutionConstructor',
      'VanityResolutionUnit',
      'VanityTimeConstructor',
      'VanityTimeUnit',
      'VanityUnitValue',
    ],
  },
]

function createProgram() {
  const indexFile = fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url))
  return ts.createProgram([indexFile], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    jsx: ts.JsxEmit.Preserve,
  })
}

interface PublicExport {
  readonly name: string
  readonly symbol: ts.Symbol
}

function publicExportSymbols(program: ts.Program): readonly PublicExport[] {
  const checker = program.getTypeChecker()
  const indexFile = fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url))
  const source = program.getSourceFile(indexFile)
  assert.ok(source, `unable to load ${indexFile}`)
  const module = checker.getSymbolAtLocation(source)
  assert.ok(module, `unable to resolve ${indexFile} as a module`)

  const names = source.statements.flatMap((statement) => {
    if (!ts.isExportDeclaration(statement) || !statement.exportClause || !ts.isNamedExports(statement.exportClause))
      return []
    return statement.exportClause.elements.map(element => element.name.text)
  })
  const exports = new Map(checker.getExportsOfModule(module).map(symbol => [symbol.name, symbol]))
  return names.map((name) => {
    const symbol = exports.get(name)
    assert.ok(symbol, `index.ts export ${name} did not resolve through the checker`)
    return {
      name,
      symbol: symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol,
    }
  })
}

function hasDocumentation(symbol: ts.Symbol): boolean {
  return (symbol.declarations ?? []).some(declaration => ts.getJSDocCommentsAndTags(declaration).length > 0)
}

function missingMemberDocumentation(symbol: ts.Symbol): readonly string[] {
  const declaration = symbol.declarations?.find(ts.isInterfaceDeclaration)
  if (declaration === undefined)
    return []

  return declaration.members
    .filter(member => ts.isPropertySignature(member) || ts.isMethodSignature(member))
    .filter(member => ts.getJSDocCommentsAndTags(member).length === 0)
    .map((member) => {
      if (member.name === undefined)
        return '<computed>'
      return ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)
        ? member.name.text
        : '<computed>'
    })
}

test('every package-root re-export is documented or explicitly self-describing', () => {
  const program = createProgram()
  const allowlist = new Map<string, string>()
  for (const group of SELF_DESCRIBING_GROUPS) {
    for (const name of group.names) {
      assert.ok(group.reason.trim(), `allowlist reason is empty for ${name}`)
      assert.equal(
        /Options$|Config$/.test(name) || NEVER_ALLOWLISTED_NAMES.has(name),
        false,
        `authoring inputs and choice vocabularies cannot be allowlisted: ${name}`,
      )
      assert.equal(allowlist.has(name), false, `duplicate public-surface allowlist entry: ${name}`)
      allowlist.set(name, group.reason)
    }
  }
  for (const name of NEVER_ALLOWLISTED_NAMES)
    assert.equal(allowlist.has(name), false, `named authoring vocabulary cannot enter the self-describing allowlist: ${name}`)

  const symbols = publicExportSymbols(program)
  const undocumented = symbols
    .filter(exported => !hasDocumentation(exported.symbol))
    .map(exported => exported.name)
  const unexplained = undocumented.filter(name => !allowlist.has(name))
  const stale = [...allowlist.keys()].filter(name => !undocumented.includes(name))

  assert.deepEqual(unexplained, [], `undocumented public exports without a justified allowlist entry: ${unexplained.join(', ')}`)
  assert.deepEqual(stale, [], `remove allowlist entries that now have documentation: ${stale.join(', ')}`)

  const membersWithoutDocs = symbols.flatMap(({ name, symbol }) => {
    if (!name.endsWith('Options') && !name.endsWith('Config') && !MEMBER_DOCUMENTATION_NAMES.has(name))
      return []
    return missingMemberDocumentation(symbol).map(member => `${name}.${member}`)
  })
  assert.deepEqual(
    membersWithoutDocs,
    [],
    `public authoring-input members without their own doc line: ${membersWithoutDocs.join(', ')}`,
  )
})
