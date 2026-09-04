import type { VanityTokenRecord } from '../introspect/records'
import type {
  VanityRuntimeAxisContract,
  VanityRuntimeBranchContract,
  VanityRuntimeContract,
  VanityRuntimeRootContract,
  VanityRuntimeTokenContract,
} from '../runtime/contract'
import type { VanityHandleMeta, VanitySemanticTokenAddress } from '../tokens/handle'
import type { VanityAxisRegistryDescription } from './axes'
import type { VanityConditionArm, VanityConditionAst } from './conditions'
import type {
  VanityPortableCapabilities,
  VanityPortableSystem,
  VanitySystemIdentities,
} from './contract'
import { VanityError } from '../diagnostics'

type RecordValue = Record<string, unknown>

const CSS_DATA_TYPES = new Set([
  'unknown',
  'declaration',
  'number',
  'integer',
  'percentage',
  'number-percentage',
  'length',
  'length-percentage',
  'angle',
  'time',
  'frequency',
  'resolution',
  'flex',
  'color',
  'image',
  'position',
  'easing-function',
  'transform-function',
  'transform-list',
  'custom-ident',
  'dashed-ident',
  'string',
  'url',
])

/** Validate the complete current portable-system shape before projection hashing. */
export function assertPortableSystemShape(
  value: unknown,
  expectedFormat: string,
): asserts value is VanityPortableSystem {
  assertJsonValue(value, 'portable system')
  const system = requireRecord(value, 'portable system')
  assertExactKeys(system, [
    'format',
    'prefix',
    'root',
    'layerRoot',
    'layers',
    'capabilities',
    'policies',
    'conditions',
    'conditionArms',
    'conditionAsts',
    'tokens',
    'tokenRecords',
    'runtime',
    'consts',
    'utilities',
    'ruleGroups',
    'plugins',
    'owners',
    'audits',
    'overwrites',
    'identities',
  ], ['source', 'tokenLayer', 'axes'], 'portable system')
  if (system.format !== expectedFormat)
    fail('portable system.format', `unsupported portable system format '${String(system.format)}'`)
  assertString(system.prefix, 'portable system.prefix')
  assertString(system.root, 'portable system.root')
  assertString(system.layerRoot, 'portable system.layerRoot')
  assertStringArray(system.layers, 'portable system.layers')
  assertPortableCapabilities(system.capabilities)
  assertPortablePolicies(system.policies)
  assertStringRecord(system.conditions, 'portable system.conditions')
  assertConditionArms(system.conditionArms, 'portable system.conditionArms')
  assertConditionAsts(system.conditionAsts, 'portable system.conditionAsts')
  if (system.axes !== undefined)
    assertAxisDescription(system.axes)
  assertArray(system.tokens, 'portable system.tokens')
  system.tokens.forEach((token, index) => assertHandleMeta(token, `portable system.tokens[${index}]`))
  assertArray(system.tokenRecords, 'portable system.tokenRecords')
  system.tokenRecords.forEach((token, index) => assertTokenRecord(token, `portable system.tokenRecords[${index}]`))
  assertRuntimeContract(system.runtime)
  assertJsonRecord(system.consts, 'portable system.consts')
  assertStringArray(system.utilities, 'portable system.utilities')
  assertArray(system.ruleGroups, 'portable system.ruleGroups')
  system.ruleGroups.forEach((group, index) => assertRuleGroup(group, `portable system.ruleGroups[${index}]`))
  assertStringArray(system.plugins, 'portable system.plugins')
  assertOwners(system.owners)
  assertAuditRecord(system.audits)
  assertArray(system.overwrites, 'portable system.overwrites')
  system.overwrites.forEach((entry, index) => assertOverwrite(entry, `portable system.overwrites[${index}]`))
  assertSystemIdentities(system.identities)
  assertOptionalString(system.source, 'portable system.source')
  assertOptionalString(system.tokenLayer, 'portable system.tokenLayer')
}

function assertPortableCapabilities(value: unknown): asserts value is VanityPortableCapabilities {
  const capabilities = requireRecord(value, 'portable system.capabilities')
  assertExactKeys(capabilities, ['signature', 'supportTarget', 'constructors', 'extensions'], [], 'portable system.capabilities')
  assertString(capabilities.signature, 'portable system.capabilities.signature')
  assertString(capabilities.supportTarget, 'portable system.capabilities.supportTarget')
  assertArray(capabilities.constructors, 'portable system.capabilities.constructors')
  capabilities.constructors.forEach((entry, index) => assertConstructor(entry, `portable system.capabilities.constructors[${index}]`))
  assertArray(capabilities.extensions, 'portable system.capabilities.extensions')
  capabilities.extensions.forEach((entry, index) => assertExtension(entry, `portable system.capabilities.extensions[${index}]`))
}

function assertConstructor(value: unknown, path: string): void {
  const entry = requireRecord(value, path)
  assertExactKeys(entry, ['name', 'origin'], [], path)
  assertNonEmptyString(entry.name, `${path}.name`)
  assertOrigin(entry.origin, `${path}.origin`)
}

function assertOrigin(value: unknown, path: string): void {
  const origin = requireRecord(value, path)
  assertString(origin.kind, `${path}.kind`)
  switch (origin.kind) {
    case 'builtin':
    case 'system':
      assertExactKeys(origin, ['kind'], [], path)
      return
    case 'plugin':
      assertExactKeys(origin, ['kind', 'id'], [], path)
      assertNonEmptyString(origin.id, `${path}.id`)
      return
    case 'extension':
      assertExactKeys(origin, ['kind', 'id', 'version'], [], path)
      assertNonEmptyString(origin.id, `${path}.id`)
      assertNonEmptyString(origin.version, `${path}.version`)
      return
    default:
      fail(`${path}.kind`, `must be builtin, system, plugin, or extension`)
  }
}

function assertExtension(value: unknown, path: string): void {
  const extension = requireRecord(value, path)
  assertExactKeys(extension, ['id', 'version'], ['fingerprint'], path)
  assertNonEmptyString(extension.id, `${path}.id`)
  assertVersion(extension.version, `${path}.version`)
  assertOptionalString(extension.fingerprint, `${path}.fingerprint`)
}

function assertPortablePolicies(value: unknown): void {
  const policies = requireRecord(value, 'portable system.policies')
  if (Object.hasOwn(policies, 'support'))
    fail('portable system.policies.support', 'is not part of the portable policy contract')
  for (const name of ['constructors', 'layerOrder', 'tokens', 'plugins']) {
    if (!Object.hasOwn(policies, name))
      fail(`portable system.policies.${name}`, 'is required')
  }
  for (const [name, policy] of Object.entries(policies)) {
    switch (name) {
      case 'constructors':
        assertJsonRecord(policy, 'portable system.policies.constructors')
        for (const [constructor, definition] of Object.entries(policy as RecordValue))
          assertConstructorPolicy(definition, `portable system.policies.constructors.${constructor}`)
        break
      case 'layerOrder':
        assertStringArray(policy, 'portable system.policies.layerOrder')
        break
      case 'tokens':
        assertTokenPolicies(policy)
        break
      case 'plugins':
        assertJsonRecord(policy, 'portable system.policies.plugins')
        break
      default:
        assertJsonValue(policy, `portable system.policies.${name}`)
    }
  }
}

function assertConstructorPolicy(value: unknown, path: string): void {
  const policy = requireRecord(value, path)
  assertExactKeys(policy, [], ['unitless', 'restrict', 'description'], path)
  assertOptionalString(policy.unitless, `${path}.unitless`)
  assertOptionalString(policy.description, `${path}.description`)
  if (policy.restrict !== undefined) {
    const restrict = requireRecord(policy.restrict, `${path}.restrict`)
    assertExactKeys(restrict, ['level'], ['use', 'reason', 'enforce'], `${path}.restrict`)
    if (restrict.level !== 'forbid' && restrict.level !== 'discourage')
      fail(`${path}.restrict.level`, `must be forbid or discourage`)
    assertOptionalString(restrict.use, `${path}.restrict.use`)
    assertOptionalString(restrict.reason, `${path}.restrict.reason`)
    if (restrict.enforce !== undefined && restrict.enforce !== 'prospective' && restrict.enforce !== 'retroactive')
      fail(`${path}.restrict.enforce`, `must be prospective or retroactive`)
  }
}

function assertTokenPolicies(value: unknown): void {
  const policies = requireRecord(value, 'portable system.policies.tokens')
  assertExactKeys(policies, [], ['reference', 'emit'], 'portable system.policies.tokens')
  if (policies.reference !== undefined && policies.reference !== 'var' && policies.reference !== 'val')
    fail('portable system.policies.tokens.reference', 'must be var or val')
  if (policies.emit !== undefined && typeof policies.emit !== 'boolean')
    fail('portable system.policies.tokens.emit', 'must be boolean')
}

function assertConditionArms(value: unknown, path: string): void {
  const record = requireRecord(value, path)
  for (const [name, arms] of Object.entries(record)) {
    assertArray(arms, `${path}.${name}`)
    arms.forEach((arm, index) => assertConditionArm(arm, `${path}.${name}[${index}]`))
  }
}

function assertConditionArm(value: unknown, path: string): asserts value is VanityConditionArm {
  const arm = requireRecord(value, path)
  assertExactKeys(arm, [], ['media', 'supports', 'container', 'selector', 'scopes', 'anchor', 'runtime'], path)
  for (const key of ['media', 'supports', 'container', 'selector'] as const)
    assertOptionalString(arm[key], `${path}.${key}`)
  if (arm.scopes !== undefined)
    assertStringArray(arm.scopes, `${path}.scopes`)
  if (arm.anchor !== undefined && !['system-root', 'module-root', 'this-mode'].includes(String(arm.anchor)))
    fail(`${path}.anchor`, 'must be a known condition anchor')
  if (arm.runtime !== undefined)
    assertRuntimeAttribute(arm.runtime, `${path}.runtime`)
}

function assertConditionAsts(value: unknown, path: string): void {
  const record = requireRecord(value, path)
  for (const [name, ast] of Object.entries(record))
    assertConditionAst(ast, `${path}.${name}`)
}

function assertConditionAst(value: unknown, path: string): asserts value is VanityConditionAst {
  const ast = requireRecord(value, path)
  assertString(ast.kind, `${path}.kind`)
  switch (ast.kind) {
    case 'selector':
      assertExactKeys(ast, ['kind', 'selector'], [], path)
      assertString(ast.selector, `${path}.selector`)
      return
    case 'media':
    case 'supports':
      assertExactKeys(ast, ['kind', 'query'], [], path)
      assertString(ast.query, `${path}.query`)
      return
    case 'container':
      assertExactKeys(ast, ['kind', 'query'], ['name'], path)
      assertString(ast.query, `${path}.query`)
      assertOptionalString(ast.name, `${path}.name`)
      return
    case 'scope':
      assertExactKeys(ast, ['kind', 'start'], ['limit'], path)
      assertString(ast.start, `${path}.start`)
      assertOptionalString(ast.limit, `${path}.limit`)
      return
    case 'anchor':
      assertExactKeys(ast, ['kind', 'anchor'], [], path)
      if (!['system-root', 'module-root', 'this-mode'].includes(String(ast.anchor)))
        fail(`${path}.anchor`, 'must be a known condition anchor')
      return
    case 'and':
    case 'or':
      assertExactKeys(ast, ['kind', 'conditions'], [], path)
      assertArray(ast.conditions, `${path}.conditions`)
      ast.conditions.forEach((condition, index) => assertConditionAst(condition, `${path}.conditions[${index}]`))
      return
    case 'not':
      assertExactKeys(ast, ['kind', 'condition'], [], path)
      assertConditionAst(ast.condition, `${path}.condition`)
      return
    default:
      fail(`${path}.kind`, 'is not a supported condition AST node')
  }
}

function assertAxisDescription(value: unknown): asserts value is VanityAxisRegistryDescription {
  const axes = requireRecord(value, 'portable system.axes')
  assertExactKeys(axes, ['order', 'definitions'], [], 'portable system.axes')
  assertStringArray(axes.order, 'portable system.axes.order')
  const definitions = requireRecord(axes.definitions, 'portable system.axes.definitions')
  for (const [name, definition] of Object.entries(definitions))
    assertAxisDefinition(definition, `portable system.axes.definitions.${name}`)
}

function assertAxisDefinition(value: unknown, path: string): void {
  const definition = requireRecord(value, path)
  assertExactKeys(definition, ['modeOrder', 'modes'], ['defaultMode', 'description', 'control', 'native'], path)
  assertStringArray(definition.modeOrder, `${path}.modeOrder`)
  assertOptionalString(definition.defaultMode, `${path}.defaultMode`)
  assertOptionalString(definition.description, `${path}.description`)
  if (definition.control !== undefined) {
    const control = requireRecord(definition.control, `${path}.control`)
    assertExactKeys(control, ['id'], [], `${path}.control`)
    assertNonEmptyString(control.id, `${path}.control.id`)
  }
  if (definition.native !== undefined)
    assertNativePolicy(definition.native, `${path}.native`)
  const modes = requireRecord(definition.modes, `${path}.modes`)
  for (const [name, mode] of Object.entries(modes)) {
    const modeRecord = requireRecord(mode, `${path}.modes.${name}`)
    assertExactKeys(modeRecord, ['derived', 'arms'], [], `${path}.modes.${name}`)
    assertBoolean(modeRecord.derived, `${path}.modes.${name}.derived`)
    assertArray(modeRecord.arms, `${path}.modes.${name}.arms`)
    modeRecord.arms.forEach((arm, index) => assertAxisArm(arm, `${path}.modes.${name}.arms[${index}]`))
  }
}

function assertNativePolicy(value: unknown, path: string): void {
  const policy = requireRecord(value, path)
  assertExactKeys(policy, ['kind', 'locality', 'fallback', 'light', 'dark'], [], path)
  if (policy.kind !== 'scheme' || !['element', 'root'].includes(String(policy.locality))
    || !['diagnose', 'document'].includes(String(policy.fallback))) {
    fail(path, 'contains an invalid native scheme policy')
  }
  assertString(policy.light, `${path}.light`)
  assertString(policy.dark, `${path}.dark`)
}

function assertAxisArm(value: unknown, path: string): void {
  const arm = requireRecord(value, path)
  assertExactKeys(arm, ['when', 'mechanism', 'locality', 'placement', 'priority'], ['scopes', 'degraded', 'runtime'], path)
  assertString(arm.when, `${path}.when`)
  if (!['selector', 'media', 'supports', 'container', 'scope'].includes(String(arm.mechanism)))
    fail(`${path}.mechanism`, 'contains an invalid axis mechanism')
  if (!['root', 'subtree', 'document', 'absolute'].includes(String(arm.locality)))
    fail(`${path}.locality`, 'contains an invalid axis locality')
  if (!['root', 'ancestor', 'descendant', 'absolute', 'query'].includes(String(arm.placement)))
    fail(`${path}.placement`, 'contains an invalid axis placement')
  assertInteger(arm.priority, `${path}.priority`)
  if (arm.scopes !== undefined)
    assertStringArray(arm.scopes, `${path}.scopes`)
  if (arm.degraded !== undefined && arm.degraded !== true)
    fail(`${path}.degraded`, 'must be true when present')
  if (arm.runtime !== undefined)
    assertRuntimeAttribute(arm.runtime, `${path}.runtime`)
}

function assertHandleMeta(value: unknown, path: string): asserts value is VanityHandleMeta {
  const meta = requireRecord(value, path)
  assertExactKeys(meta, ['name', 'path'], [
    'reference',
    'emit',
    'mutable',
    'type',
    'value',
    'description',
    'deprecated',
    'metadata',
    'register',
    'validate',
    'runtime',
    'axes',
    'cases',
  ], path)
  assertCssName(meta.name, `${path}.name`)
  assertString(meta.path, `${path}.path`)
  if (meta.reference !== undefined && meta.reference !== 'val' && meta.reference !== 'var')
    fail(`${path}.reference`, 'must be val or var')
  assertOptionalBoolean(meta.emit, `${path}.emit`)
  assertOptionalBoolean(meta.mutable, `${path}.mutable`)
  if (meta.type !== undefined)
    assertCssType(meta.type, `${path}.type`)
  if (meta.value !== undefined && typeof meta.value !== 'string' && typeof meta.value !== 'number')
    fail(`${path}.value`, 'must be a string or number')
  assertOptionalString(meta.description, `${path}.description`)
  assertOptionalString(meta.deprecated, `${path}.deprecated`)
  if (meta.metadata !== undefined)
    assertJsonRecord(meta.metadata, `${path}.metadata`)
  if (meta.register !== undefined)
    assertJsonValue(meta.register, `${path}.register`)
  if (meta.validate !== undefined)
    assertJsonValue(meta.validate, `${path}.validate`)
  if (meta.runtime !== undefined)
    assertHandleRuntimeAddress(meta.runtime, `${path}.runtime`)
  if (meta.axes !== undefined) {
    const axes = requireRecord(meta.axes, `${path}.axes`)
    for (const [axis, modes] of Object.entries(axes)) {
      const modeRecord = requireRecord(modes, `${path}.axes.${axis}`)
      for (const [mode, branch] of Object.entries(modeRecord))
        assertHandleBranch(branch, `${path}.axes.${axis}.${mode}`)
    }
  }
  if (meta.cases !== undefined) {
    assertArray(meta.cases, `${path}.cases`)
    meta.cases.forEach((branch, index) => {
      const record = requireRecord(branch, `${path}.cases[${index}]`)
      assertExactKeys(record, ['when'], ['value', 'description', 'metadata', 'runtime'], `${path}.cases[${index}]`)
      assertStringRecord(record.when, `${path}.cases[${index}].when`)
      assertOptionalTokenValue(record.value, `${path}.cases[${index}].value`)
      assertOptionalString(record.description, `${path}.cases[${index}].description`)
      if (record.metadata !== undefined)
        assertJsonRecord(record.metadata, `${path}.cases[${index}].metadata`)
      if (record.runtime !== undefined)
        assertHandleRuntimeAddress(record.runtime, `${path}.cases[${index}].runtime`)
    })
  }
}

function assertHandleBranch(value: unknown, path: string): void {
  const branch = requireRecord(value, path)
  assertExactKeys(branch, [], ['value', 'description', 'metadata', 'runtime'], path)
  assertOptionalTokenValue(branch.value, `${path}.value`)
  assertOptionalString(branch.description, `${path}.description`)
  if (branch.metadata !== undefined)
    assertJsonRecord(branch.metadata, `${path}.metadata`)
  if (branch.runtime !== undefined)
    assertHandleRuntimeAddress(branch.runtime, `${path}.runtime`)
}

function assertHandleRuntimeAddress(value: unknown, path: string): void {
  const address = requireRecord(value, path)
  assertExactKeys(address, ['system', 'token', 'address', 'slot'], [], path)
  assertString(address.system, `${path}.system`)
  assertStringArray(address.token, `${path}.token`)
  assertSemanticAddress(address.address, `${path}.address`)
  assertCssName(address.slot, `${path}.slot`)
}

function assertTokenRecord(value: unknown, path: string): asserts value is VanityTokenRecord {
  const token = requireRecord(value, path)
  assertExactKeys(token, ['kind', 'path', 'var', 'light', 'dark', 'css', 'refs', 'requirements', 'preview', 'semantic'], [
    'file',
    'line',
    'column',
    'root',
    'scopes',
    'module',
    'layer',
    'upgrade',
    'description',
    'deprecated',
    'emission',
    'runtime',
  ], path)
  assertSourceFields(token, path)
  if (token.kind !== 'token')
    fail(`${path}.kind`, 'must be token')
  for (const key of ['path', 'light', 'dark', 'css'] as const)
    assertString(token[key], `${path}.${key}`)
  assertCssName(token.var, `${path}.var`)
  assertOptionalString(token.root, `${path}.root`)
  if (token.scopes !== undefined)
    assertStringArray(token.scopes, `${path}.scopes`)
  if (token.module !== undefined)
    assertStringArray(token.module, `${path}.module`)
  assertOptionalString(token.layer, `${path}.layer`)
  assertOptionalString(token.upgrade, `${path}.upgrade`)
  assertOptionalString(token.description, `${path}.description`)
  assertOptionalString(token.deprecated, `${path}.deprecated`)
  assertStringArray(token.refs, `${path}.refs`)
  assertStringArray(token.requirements, `${path}.requirements`)
  assertTokenPreview(token.preview, `${path}.preview`)
  if (token.emission !== undefined) {
    assertArray(token.emission, `${path}.emission`)
    token.emission.forEach((entry, index) => assertEmission(entry, `${path}.emission[${index}]`))
  }
  if (token.runtime !== undefined)
    assertTokenRecordRuntime(token.runtime, `${path}.runtime`)
  assertTokenSemantic(token.semantic, `${path}.semantic`)
}

function assertSourceFields(value: RecordValue, path: string): void {
  if (value.file !== undefined)
    assertString(value.file, `${path}.file`)
  if (value.line !== undefined)
    assertInteger(value.line, `${path}.line`)
  if (value.column !== undefined)
    assertInteger(value.column, `${path}.column`)
}

function assertTokenPreview(value: unknown, path: string): void {
  const preview = requireRecord(value, path)
  assertString(preview.status, `${path}.status`)
  if (preview.status === 'available') {
    assertExactKeys(preview, ['status', 'light', 'dark'], [], path)
    assertString(preview.light, `${path}.light`)
    assertString(preview.dark, `${path}.dark`)
  }
  else if (preview.status === 'unavailable') {
    assertExactKeys(preview, ['status', 'reason'], [], path)
    assertString(preview.reason, `${path}.reason`)
  }
  else {
    fail(`${path}.status`, 'must be available or unavailable')
  }
}

function assertEmission(value: unknown, path: string): void {
  const emission = requireRecord(value, path)
  assertExactKeys(emission, ['kind', 'root'], [
    'layer',
    'axis',
    'mode',
    'when',
    'mechanism',
    'locality',
    'placement',
    'priority',
    'media',
    'supports',
    'container',
    'scopes',
  ], path)
  if (!['base', 'native', 'axis', 'case'].includes(String(emission.kind)))
    fail(`${path}.kind`, 'contains an invalid emission kind')
  assertString(emission.root, `${path}.root`)
  for (const key of ['layer', 'axis', 'mode', 'mechanism', 'locality', 'placement', 'media', 'supports', 'container'] as const)
    assertOptionalString(emission[key], `${path}.${key}`)
  assertOptionalInteger(emission.priority, `${path}.priority`)
  if (emission.when !== undefined)
    assertStringRecord(emission.when, `${path}.when`)
  if (emission.scopes !== undefined)
    assertStringArray(emission.scopes, `${path}.scopes`)
}

function assertTokenRecordRuntime(value: unknown, path: string): void {
  const runtime = requireRecord(value, path)
  assertExactKeys(runtime, ['type', 'addresses'], ['validation'], path)
  assertString(runtime.type, `${path}.type`)
  if (runtime.validation !== undefined) {
    const validation = requireRecord(runtime.validation, `${path}.validation`)
    assertExactKeys(validation, ['id', 'runtime', 'onInvalid'], [], `${path}.validation`)
    assertNonEmptyString(validation.id, `${path}.validation.id`)
    assertRuntimeMode(validation.runtime, `${path}.validation.runtime`)
    assertString(validation.onInvalid, `${path}.validation.onInvalid`)
  }
  assertArray(runtime.addresses, `${path}.addresses`)
  runtime.addresses.forEach((entry, index) => {
    const address = requireRecord(entry, `${path}.addresses[${index}]`)
    assertExactKeys(address, ['address', 'slot'], [], `${path}.addresses[${index}]`)
    assertSemanticAddress(address.address, `${path}.addresses[${index}].address`)
    assertCssName(address.slot, `${path}.addresses[${index}].slot`)
  })
}

function assertTokenSemantic(value: unknown, path: string): void {
  const semantic = requireRecord(value, path)
  assertExactKeys(semantic, [
    'type',
    'reference',
    'emit',
    'mutable',
    'hasDefault',
    'expression',
    'inference',
    'fold',
    'dependencies',
    'support',
    'declarations',
    'branches',
    'portability',
    'metadata',
  ], ['registration'], path)
  assertCssType(semantic.type, `${path}.type`)
  assertReference(semantic.reference, `${path}.reference`)
  assertBoolean(semantic.emit, `${path}.emit`)
  assertBoolean(semantic.mutable, `${path}.mutable`)
  assertBoolean(semantic.hasDefault, `${path}.hasDefault`)
  assertExpression(semantic.expression, `${path}.expression`)
  const inference = requireRecord(semantic.inference, `${path}.inference`)
  assertExactKeys(inference, ['reference', 'emit', 'reasons'], [], `${path}.inference`)
  if (!['explicit', 'policy', 'capability'].includes(String(inference.reference))
    || !['explicit', 'policy', 'capability'].includes(String(inference.emit))) {
    fail(`${path}.inference`, 'contains an invalid inference source')
  }
  assertStringArray(inference.reasons, `${path}.inference.reasons`)
  const fold = requireRecord(semantic.fold, `${path}.fold`)
  assertExactKeys(fold, ['status'], ['val', 'reason'], `${path}.fold`)
  if (!['folded', 'preserved', 'unavailable'].includes(String(fold.status)))
    fail(`${path}.fold.status`, 'contains an invalid fold status')
  assertOptionalTokenValue(fold.val, `${path}.fold.val`)
  assertOptionalString(fold.reason, `${path}.fold.reason`)
  assertArray(semantic.dependencies, `${path}.dependencies`)
  semantic.dependencies.forEach((entry, index) => assertDependency(entry, `${path}.dependencies[${index}]`))
  const support = requireRecord(semantic.support, `${path}.support`)
  assertExactKeys(support, ['requirements'], ['target', 'fallback', 'enhancement'], `${path}.support`)
  assertStringArray(support.requirements, `${path}.support.requirements`)
  assertOptionalString(support.target, `${path}.support.target`)
  assertOptionalString(support.fallback, `${path}.support.fallback`)
  assertOptionalString(support.enhancement, `${path}.support.enhancement`)
  assertArray(semantic.declarations, `${path}.declarations`)
  semantic.declarations.forEach((entry, index) => assertDeclaration(entry, `${path}.declarations[${index}]`))
  assertArray(semantic.branches, `${path}.branches`)
  semantic.branches.forEach((entry, index) => assertSemanticBranch(entry, `${path}.branches[${index}]`))
  if (semantic.registration !== undefined)
    assertTokenRegistration(semantic.registration, `${path}.registration`)
  const portability = requireRecord(semantic.portability, `${path}.portability`)
  assertExactKeys(portability, ['status'], ['extension', 'reason'], `${path}.portability`)
  if (!['portable', 'codec', 'nonportable'].includes(String(portability.status)))
    fail(`${path}.portability.status`, 'contains an invalid portability status')
  if (portability.extension !== undefined)
    assertExtension(portability.extension, `${path}.portability.extension`)
  assertOptionalString(portability.reason, `${path}.portability.reason`)
  assertJsonRecord(semantic.metadata, `${path}.metadata`)
}

function assertTokenRegistration(value: unknown, path: string): void {
  const registration = requireRecord(value, path)
  assertExactKeys(registration, ['syntax', 'inherits'], ['initialVal'], path)
  assertString(registration.syntax, `${path}.syntax`)
  assertBoolean(registration.inherits, `${path}.inherits`)
  assertOptionalString(registration.initialVal, `${path}.initialVal`)
}

function assertExpression(value: unknown, path: string): void {
  const expression = requireRecord(value, path)
  assertExactKeys(expression, ['kind', 'type'], ['css', 'source', 'extension', 'detail', 'children'], path)
  assertString(expression.kind, `${path}.kind`)
  assertCssType(expression.type, `${path}.type`)
  assertOptionalString(expression.css, `${path}.css`)
  if (expression.source !== undefined)
    assertSource(expression.source, `${path}.source`)
  if (expression.extension !== undefined)
    assertExtension(expression.extension, `${path}.extension`)
  if (expression.detail !== undefined) {
    const detail = requireRecord(expression.detail, `${path}.detail`)
    for (const [key, detailValue] of Object.entries(detail)) {
      if (typeof detailValue !== 'string' && typeof detailValue !== 'number' && typeof detailValue !== 'boolean' && detailValue !== null)
        fail(`${path}.detail.${key}`, 'must be a scalar JSON value')
    }
  }
  if (expression.children !== undefined) {
    assertArray(expression.children, `${path}.children`)
    expression.children.forEach((child, index) => assertExpression(child, `${path}.children[${index}]`))
  }
}

function assertSource(value: unknown, path: string): void {
  const source = requireRecord(value, path)
  assertExactKeys(source, [], ['helper', 'authored', 'file', 'line', 'column', 'parents'], path)
  for (const key of ['helper', 'authored', 'file'] as const)
    assertOptionalString(source[key], `${path}.${key}`)
  assertOptionalInteger(source.line, `${path}.line`)
  assertOptionalInteger(source.column, `${path}.column`)
  if (source.parents !== undefined) {
    assertArray(source.parents, `${path}.parents`)
    source.parents.forEach((parent, index) => assertSource(parent, `${path}.parents[${index}]`))
  }
}

function assertDependency(value: unknown, path: string): void {
  const dependency = requireRecord(value, path)
  assertExactKeys(dependency, ['kind', 'type', 'resolution'], ['path', 'name', 'extension'], path)
  if (!['token', 'custom-property', 'plugin'].includes(String(dependency.kind)))
    fail(`${path}.kind`, 'contains an invalid dependency kind')
  assertCssType(dependency.type, `${path}.type`)
  if (dependency.resolution !== 'self' && dependency.resolution !== 'system')
    fail(`${path}.resolution`, 'must be self or system')
  assertOptionalString(dependency.path, `${path}.path`)
  if (dependency.name !== undefined)
    assertCssName(dependency.name, `${path}.name`)
  if (dependency.extension !== undefined)
    assertExtension(dependency.extension, `${path}.extension`)
}

function assertDeclaration(value: unknown, path: string): void {
  const declaration = requireRecord(value, path)
  assertExactKeys(declaration, ['kind', 'val', 'context'], ['name', 'axis', 'mode', 'when'], path)
  if (!['base', 'axis', 'case', 'override', 'slot'].includes(String(declaration.kind)))
    fail(`${path}.kind`, 'contains an invalid declaration kind')
  assertTokenValue(declaration.val, `${path}.val`)
  if (declaration.name !== undefined)
    assertCssName(declaration.name, `${path}.name`)
  for (const key of ['axis', 'mode'] as const)
    assertOptionalString(declaration[key], `${path}.${key}`)
  if (declaration.when !== undefined)
    assertStringRecord(declaration.when, `${path}.when`)
  const context = requireRecord(declaration.context, `${path}.context`)
  assertExactKeys(context, ['root', 'selectors', 'atRules'], ['layer'], `${path}.context`)
  assertString(context.root, `${path}.context.root`)
  assertStringArray(context.selectors, `${path}.context.selectors`)
  assertStringArray(context.atRules, `${path}.context.atRules`)
  assertOptionalString(context.layer, `${path}.context.layer`)
  if (declaration.source !== undefined)
    assertSourceFields(requireRecord(declaration.source, `${path}.source`), `${path}.source`)
}

function assertSemanticBranch(value: unknown, path: string): void {
  const branch = requireRecord(value, path)
  assertExactKeys(branch, ['address', 'val'], ['expression'], path)
  assertSemanticAddress(branch.address, `${path}.address`)
  assertTokenValue(branch.val, `${path}.val`)
  if (branch.expression !== undefined)
    assertExpression(branch.expression, `${path}.expression`)
}

function assertSemanticAddress(value: unknown, path: string): asserts value is VanitySemanticTokenAddress {
  const address = requireRecord(value, path)
  assertString(address.kind, `${path}.kind`)
  switch (address.kind) {
    case 'base':
      assertExactKeys(address, ['kind'], [], path)
      return
    case 'axis':
      assertExactKeys(address, ['kind', 'axis', 'mode'], [], path)
      assertString(address.axis, `${path}.axis`)
      assertString(address.mode, `${path}.mode`)
      return
    case 'case':
      assertExactKeys(address, ['kind', 'when'], [], path)
      assertStringRecord(address.when, `${path}.when`)
      return
    default:
      fail(`${path}.kind`, 'contains an invalid semantic token address')
  }
}

function assertRuntimeContract(value: unknown): asserts value is VanityRuntimeContract {
  const runtime = requireRecord(value, 'portable system.runtime')
  assertExactKeys(runtime, ['protocol', 'system', 'prefix', 'root', 'axisOrder', 'axes', 'roots', 'tokens'], [], 'portable system.runtime')
  if (runtime.protocol !== 2)
    fail('portable system.runtime.protocol', 'must be 2')
  for (const key of ['system', 'prefix', 'root'] as const)
    assertString(runtime[key], `portable system.runtime.${key}`)
  assertStringArray(runtime.axisOrder, 'portable system.runtime.axisOrder')
  const axes = requireRecord(runtime.axes, 'portable system.runtime.axes')
  for (const [name, axis] of Object.entries(axes))
    assertRuntimeAxis(axis, `portable system.runtime.axes.${name}`)
  assertArray(runtime.roots, 'portable system.runtime.roots')
  runtime.roots.forEach((root, index) => assertRuntimeRoot(root, `portable system.runtime.roots[${index}]`))
  assertArray(runtime.tokens, 'portable system.runtime.tokens')
  runtime.tokens.forEach((token, index) => assertRuntimeToken(token, `portable system.runtime.tokens[${index}]`))
}

function assertRuntimeAxis(value: unknown, path: string): asserts value is VanityRuntimeAxisContract {
  const axis = requireRecord(value, path)
  assertExactKeys(axis, [], ['defaultMode', 'modes', 'attribute', 'control'], path)
  assertOptionalString(axis.defaultMode, `${path}.defaultMode`)
  if (axis.modes !== undefined)
    assertStringArray(axis.modes, `${path}.modes`)
  if (axis.attribute !== undefined) {
    const attribute = requireRecord(axis.attribute, `${path}.attribute`)
    assertExactKeys(attribute, ['name', 'values'], [], `${path}.attribute`)
    assertString(attribute.name, `${path}.attribute.name`)
    const values = requireRecord(attribute.values, `${path}.attribute.values`)
    for (const [mode, selected] of Object.entries(values)) {
      if (selected !== null && typeof selected !== 'string')
        fail(`${path}.attribute.values.${mode}`, 'must be a string or null')
    }
  }
  if (axis.control !== undefined) {
    const control = requireRecord(axis.control, `${path}.control`)
    assertExactKeys(control, ['id'], ['projections'], `${path}.control`)
    assertNonEmptyString(control.id, `${path}.control.id`)
    if (control.projections !== undefined) {
      const projections = requireRecord(control.projections, `${path}.control.projections`)
      for (const [mode, projection] of Object.entries(projections))
        assertRuntimeProjection(projection, `${path}.control.projections.${mode}`)
    }
  }
}

function assertRuntimeProjection(value: unknown, path: string): void {
  const projection = requireRecord(value, path)
  assertExactKeys(projection, [], ['style', 'attributes'], path)
  if (projection.style !== undefined)
    assertCssStringRecord(projection.style, `${path}.style`)
  if (projection.attributes !== undefined)
    assertStringRecord(projection.attributes, `${path}.attributes`)
}

function assertRuntimeAttribute(value: unknown, path: string): void {
  const attribute = requireRecord(value, path)
  assertExactKeys(attribute, ['kind', 'name', 'value'], [], path)
  if (attribute.kind !== 'attribute')
    fail(`${path}.kind`, 'must be attribute')
  assertString(attribute.name, `${path}.name`)
  if (attribute.value !== null && typeof attribute.value !== 'string')
    fail(`${path}.value`, 'must be a string or null')
}

function assertRuntimeRoot(value: unknown, path: string): asserts value is VanityRuntimeRootContract {
  const root = requireRecord(value, path)
  assertExactKeys(root, ['path', 'selector', 'axes'], ['scopes'], path)
  assertString(root.path, `${path}.path`)
  assertString(root.selector, `${path}.selector`)
  assertStringArray(root.axes, `${path}.axes`)
  if (root.scopes !== undefined)
    assertStringArray(root.scopes, `${path}.scopes`)
}

function assertRuntimeToken(value: unknown, path: string): asserts value is VanityRuntimeTokenContract {
  const token = requireRecord(value, path)
  assertExactKeys(token, ['token', 'name', 'rootPath', 'root', 'type', 'reference', 'emit', 'mutable', 'branches'], [
    'scopes',
    'value',
    'description',
    'deprecated',
    'metadata',
    'validation',
    'baseSlot',
  ], path)
  assertStringArray(token.token, `${path}.token`)
  assertCssName(token.name, `${path}.name`)
  assertString(token.rootPath, `${path}.rootPath`)
  assertString(token.root, `${path}.root`)
  if (token.scopes !== undefined)
    assertStringArray(token.scopes, `${path}.scopes`)
  assertCssType(token.type, `${path}.type`)
  assertReference(token.reference, `${path}.reference`)
  assertBoolean(token.emit, `${path}.emit`)
  assertBoolean(token.mutable, `${path}.mutable`)
  assertOptionalTokenValue(token.value, `${path}.value`)
  assertOptionalString(token.description, `${path}.description`)
  assertOptionalString(token.deprecated, `${path}.deprecated`)
  if (token.metadata !== undefined)
    assertJsonRecord(token.metadata, `${path}.metadata`)
  if (token.validation !== undefined) {
    const validation = requireRecord(token.validation, `${path}.validation`)
    assertExactKeys(validation, ['id', 'runtime', 'onInvalid'], ['fallback'], `${path}.validation`)
    assertNonEmptyString(validation.id, `${path}.validation.id`)
    assertRuntimeMode(validation.runtime, `${path}.validation.runtime`)
    if (!['throw', 'fallback', 'omit'].includes(String(validation.onInvalid)))
      fail(`${path}.validation.onInvalid`, 'must be throw, fallback, or omit')
    assertOptionalString(validation.fallback, `${path}.validation.fallback`)
  }
  assertOptionalString(token.baseSlot, `${path}.baseSlot`)
  assertArray(token.branches, `${path}.branches`)
  token.branches.forEach((branch, index) => assertRuntimeBranch(branch, `${path}.branches[${index}]`))
}

function assertRuntimeBranch(value: unknown, path: string): asserts value is VanityRuntimeBranchContract {
  const branch = requireRecord(value, path)
  assertExactKeys(branch, ['address'], ['slot', 'value'], path)
  assertSemanticAddress(branch.address, `${path}.address`)
  assertOptionalString(branch.slot, `${path}.slot`)
  assertOptionalTokenValue(branch.value, `${path}.value`)
}

function assertRuleGroup(value: unknown, path: string): void {
  const group = requireRecord(value, path)
  assertExactKeys(group, ['name', 'selectors', 'fingerprint'], ['description', 'layer', 'order'], path)
  assertNonEmptyString(group.name, `${path}.name`)
  assertStringArray(group.selectors, `${path}.selectors`)
  assertNonEmptyString(group.fingerprint, `${path}.fingerprint`)
  assertOptionalString(group.description, `${path}.description`)
  assertOptionalString(group.layer, `${path}.layer`)
  assertOptionalInteger(group.order, `${path}.order`)
}

function assertOwners(value: unknown): void {
  const owners = requireRecord(value, 'portable system.owners')
  for (const [name, owner] of Object.entries(owners)) {
    const record = requireRecord(owner, `portable system.owners.${name}`)
    assertExactKeys(record, ['kind', 'id'], [], `portable system.owners.${name}`)
    if (record.kind !== 'plugin')
      fail(`portable system.owners.${name}.kind`, 'must be plugin')
    assertNonEmptyString(record.id, `portable system.owners.${name}.id`)
  }
}

function assertAuditRecord(value: unknown): void {
  const audits = requireRecord(value, 'portable system.audits')
  for (const [name, level] of Object.entries(audits)) {
    if (!['off', 'warn', 'error'].includes(String(level)))
      fail(`portable system.audits.${name}`, 'must be off, warn, or error')
  }
}

function assertOverwrite(value: unknown, path: string): void {
  const overwrite = requireRecord(value, path)
  assertExactKeys(overwrite, ['kind', 'operation', 'paths'], ['source'], path)
  if (!['tokens', 'axis', 'conditions', 'consts', 'rules'].includes(String(overwrite.kind)))
    fail(`${path}.kind`, 'contains an invalid overwrite target')
  if (overwrite.operation !== 'augment' && overwrite.operation !== 'overwrite')
    fail(`${path}.operation`, 'must be augment or overwrite')
  assertStringArray(overwrite.paths, `${path}.paths`)
  assertOptionalString(overwrite.source, `${path}.source`)
}

function assertSystemIdentities(value: unknown): asserts value is VanitySystemIdentities {
  const identities = requireRecord(value, 'portable system.identities')
  assertExactKeys(identities, ['compatibility', 'css', 'runtime', 'docs'], [], 'portable system.identities')
  assertIdentity(identities.compatibility, 'compatibility', 'vanity-compatibility-1-')
  assertIdentity(identities.css, 'css', 'vanity-css-1-')
  assertIdentity(identities.runtime, 'runtime', 'vanity-runtime-schema-1-')
  assertIdentity(identities.docs, 'docs', 'vanity-docs-1-')
}

function assertIdentity(value: unknown, name: string, prefix: string): void {
  if (typeof value !== 'string' || !value.startsWith(prefix))
    fail(`portable system.identities.${name}`, `must start with ${prefix}`)
}

function assertJsonRecord(value: unknown, path: string): asserts value is RecordValue {
  const record = requireRecord(value, path)
  for (const [key, child] of Object.entries(record))
    assertJsonValue(child, `${path}.${key}`)
}

function assertJsonValue(value: unknown, path: string, ancestors = new WeakSet<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      fail(path, 'must contain finite numbers')
    return
  }
  if (typeof value === 'function')
    fail(path, 'cannot contain function values')
  if (typeof value !== 'object' || value === undefined)
    fail(path, 'must contain only JSON values')
  if (ancestors.has(value))
    fail(path, 'cannot contain cycles')
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        if (!(index in value))
          fail(`${path}[${index}]`, 'must not contain sparse array holes')
        assertJsonValue(value[index], `${path}[${index}]`, ancestors)
      }
    }
    else {
      if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
        fail(path, 'must contain only plain objects and arrays')
      if (Reflect.ownKeys(value).some(key => typeof key === 'symbol'))
        fail(path, 'must not contain symbol properties')
      for (const [key, child] of Object.entries(value))
        assertJsonValue(child, `${path}.${key}`, ancestors)
    }
  }
  finally {
    ancestors.delete(value)
  }
}

function requireRecord(value: unknown, path: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(path, 'must be an object')
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    fail(path, 'must be a plain object')
  return value as RecordValue
}

function assertExactKeys(value: RecordValue, required: readonly string[], optional: readonly string[], path: string): void {
  const allowed = new Set([...required, ...optional])
  const unknown = Object.keys(value).find(key => !allowed.has(key))
  if (unknown !== undefined)
    fail(`${path}.${unknown}`, 'is not a property in the current contract')
  const missing = required.find(key => !Object.hasOwn(value, key))
  if (missing !== undefined)
    fail(`${path}.${missing}`, 'is required')
}

function assertArray(value: unknown, path: string): asserts value is unknown[] {
  if (!Array.isArray(value))
    fail(path, 'must be an array')
}

function assertStringArray(value: unknown, path: string): asserts value is string[] {
  assertArray(value, path)
  value.forEach((item, index) => assertString(item, `${path}[${index}]`))
}

function assertStringRecord(value: unknown, path: string): asserts value is Record<string, string> {
  const record = requireRecord(value, path)
  for (const [key, child] of Object.entries(record))
    assertString(child, `${path}.${key}`)
}

function assertCssStringRecord(value: unknown, path: string): void {
  const record = requireRecord(value, path)
  for (const [key, child] of Object.entries(record)) {
    assertCssName(key, `${path}.${key}`)
    assertString(child, `${path}.${key}`)
  }
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string')
    fail(path, 'must be a string')
}

function assertNonEmptyString(value: unknown, path: string): asserts value is string {
  assertString(value, path)
  if (!value.trim())
    fail(path, 'must be non-empty')
}

function assertOptionalString(value: unknown, path: string): void {
  if (value !== undefined)
    assertString(value, path)
}

function assertBoolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== 'boolean')
    fail(path, 'must be a boolean')
}

function assertOptionalBoolean(value: unknown, path: string): void {
  if (value !== undefined)
    assertBoolean(value, path)
}

function assertNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    fail(path, 'must be a finite number')
}

function assertInteger(value: unknown, path: string): asserts value is number {
  assertNumber(value, path)
  if (!Number.isInteger(value))
    fail(path, 'must be an integer')
}

function assertOptionalInteger(value: unknown, path: string): void {
  if (value !== undefined)
    assertInteger(value, path)
}

function assertVersion(value: unknown, path: string): void {
  if (typeof value !== 'string' && typeof value !== 'number')
    fail(path, 'must be a string or number version')
  if (typeof value === 'number' && !Number.isFinite(value))
    fail(path, 'must be finite')
}

function assertCssType(value: unknown, path: string): void {
  assertString(value, path)
  if (!CSS_DATA_TYPES.has(value) && !value.startsWith('plugin:'))
    fail(path, 'contains an unknown CSS data type')
}

function assertReference(value: unknown, path: string): void {
  if (value !== 'self' && value !== 'system' && value !== 'val' && value !== 'var')
    fail(path, 'contains an invalid reference')
}

function assertTokenValue(value: unknown, path: string): asserts value is string | number | null {
  if (value !== null && typeof value !== 'string' && typeof value !== 'number')
    fail(path, 'must be a string, number, or null')
}

function assertOptionalTokenValue(value: unknown, path: string): void {
  if (value !== undefined)
    assertTokenValue(value, path)
}

function assertCssName(value: unknown, path: string): asserts value is string {
  assertString(value, path)
  if (!value.startsWith('--'))
    fail(path, 'must be a CSS custom-property name beginning with --')
}

function assertRuntimeMode(value: unknown, path: string): void {
  if (value !== false && value !== 'dev' && value !== 'always')
    fail(path, 'must be false, dev, or always')
}

function fail(path: string, message: string): never {
  throw new VanityError({
    code: 'VANITY_SYSTEM_INCOMPATIBLE',
    message: `invalid contract data at ${path}: ${message}`,
    path: [path],
    fix: 'regenerate the portable system contract from the current Vanity version',
  })
}

// These shape helpers are shared by the Manifest v4 reader. Keeping the
// implementation in one boundary module prevents the portable and manifest
// projections from silently accepting different nested contracts.
export function assertConditionArmShape(value: unknown, path: string): asserts value is VanityConditionArm {
  assertConditionArm(value, path)
}

export function assertConditionAstShape(value: unknown, path: string): asserts value is VanityConditionAst {
  assertConditionAst(value, path)
}

export function assertDeclarationShape(value: unknown, path: string): void {
  assertDeclaration(value, path)
}

export function assertDependencyShape(value: unknown, path: string): void {
  assertDependency(value, path)
}

export function assertExpressionShape(value: unknown, path: string): void {
  assertExpression(value, path)
}

export function assertExtensionShape(value: unknown, path: string): void {
  assertExtension(value, path)
}

export function assertJsonRecordShape(value: unknown, path: string): asserts value is RecordValue {
  assertJsonRecord(value, path)
}

export function assertJsonValueShape(value: unknown, path: string): void {
  assertJsonValue(value, path)
}

export function assertNativePolicyShape(value: unknown, path: string): void {
  assertNativePolicy(value, path)
}

export function assertOriginShape(value: unknown, path: string): void {
  assertOrigin(value, path)
}

export function assertSemanticAddressShape(value: unknown, path: string): asserts value is VanitySemanticTokenAddress {
  assertSemanticAddress(value, path)
}

export function assertTokenRecordRuntimeShape(value: unknown, path: string): void {
  assertTokenRecordRuntime(value, path)
}

export function assertCssTypeShape(value: unknown, path: string): void {
  assertCssType(value, path)
}

export function assertRuntimeContractShape(value: unknown): asserts value is VanityRuntimeContract {
  assertRuntimeContract(value)
}
