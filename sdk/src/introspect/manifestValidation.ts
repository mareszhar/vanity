import type { VanityManifest } from './manifest'
import type { VanitySystemMap } from './system'
import { VanityError } from '../diagnostics'
import {
  assertConditionArmShape,
  assertConditionAstShape,
  assertCssTypeShape,
  assertDeclarationShape,
  assertDependencyShape,
  assertExpressionShape,
  assertExtensionShape,
  assertJsonRecordShape,
  assertJsonValueShape,
  assertNativePolicyShape,
  assertOriginShape,
  assertRuntimeContractShape,
  assertSemanticAddressShape,
  assertTokenRecordRuntimeShape,
} from '../system/contractValidation'
import {
  VANITY_MANIFEST_FORMAT,
  VANITY_MANIFEST_SCHEMA,
  VANITY_MANIFEST_VERSION,
} from './manifest'
import {
  VANITY_INTROSPECTION_FORMAT,
  VANITY_INTROSPECTION_VERSION,
} from './system'

type RecordValue = Record<string, unknown>

const SYSTEM_IDENTITIES = ['compatibility', 'css', 'runtime', 'docs'] as const

/** Validate Manifest v4 as a closed recursive boundary contract. */
export function assertManifestShape(value: unknown): asserts value is VanityManifest {
  assertJsonValueShape(value, 'manifest')
  const manifest = requireRecord(value, 'manifest')
  assertKeys(manifest, ['$schema', 'format', 'version', 'system', 'systems', 'modules'], [], 'manifest')
  assertExactString(manifest.$schema, VANITY_MANIFEST_SCHEMA, 'manifest.$schema')
  assertExactString(manifest.format, VANITY_MANIFEST_FORMAT, 'manifest.format')
  assertExactNumber(manifest.version, VANITY_MANIFEST_VERSION, 'manifest.version')
  assertSystemMap(manifest.system, 'manifest.system')
  assertRecord(manifest.systems, 'manifest.systems')
  for (const [id, system] of Object.entries(manifest.systems))
    assertSystemMap(system, `manifest.systems.${id}`)
  assertRecord(manifest.modules, 'manifest.modules')
  for (const [id, module] of Object.entries(manifest.modules))
    assertModule(module, `manifest.modules.${id}`)
}

function assertSystemMap(value: unknown, path: string): asserts value is VanitySystemMap {
  const system = requireRecord(value, path)
  assertKeys(system, [
    'format',
    'version',
    'id',
    'kind',
    'identities',
    'prefix',
    'root',
    'layerRoot',
    'capabilities',
    'policies',
    'layers',
    'conditions',
    'axes',
    'roots',
    'tokens',
    'plugins',
    'extensions',
    'consts',
    'constructors',
    'utilities',
    'runtime',
    'ruleGroups',
    'overwrites',
    'audits',
  ], ['declaredAt', 'tokenLayer'], path)
  assertExactString(system.format, VANITY_INTROSPECTION_FORMAT, `${path}.format`)
  assertExactNumber(system.version, VANITY_INTROSPECTION_VERSION, `${path}.version`)
  assertExactString(system.kind, 'system', `${path}.kind`)
  assertNonEmptyString(system.id, `${path}.id`)
  assertIdentities(system.identities, `${path}.identities`)
  assertString(system.prefix, `${path}.prefix`)
  assertString(system.root, `${path}.root`)
  assertString(system.layerRoot, `${path}.layerRoot`)
  assertOptionalString(system.tokenLayer, `${path}.tokenLayer`)
  if (system.declaredAt !== undefined)
    assertDeclaredAt(system.declaredAt, `${path}.declaredAt`)
  const capabilities = requireRecord(system.capabilities, `${path}.capabilities`)
  assertSemanticEntry(capabilities, `${path}.capabilities`, 'capabilities', ['signature', 'supportTarget'], [])
  assertString(capabilities.signature, `${path}.capabilities.signature`)
  assertString(capabilities.supportTarget, `${path}.capabilities.supportTarget`)
  assertPolicyRecord(system.policies, `${path}.policies`)
  assertArray(system.layers, `${path}.layers`)
  system.layers.forEach((value, index) => {
    const layer = requireRecord(value, `${path}.layers[${index}]`)
    assertSemanticEntry(layer, `${path}.layers[${index}]`, 'layer', ['name', 'order'], [])
    assertNonEmptyString(layer.name, `${path}.layers[${index}].name`)
    assertInteger(layer.order, `${path}.layers[${index}].order`)
  })
  assertRecord(system.conditions, `${path}.conditions`)
  for (const [name, value] of Object.entries(system.conditions as RecordValue)) {
    const conditionPath = `${path}.conditions.${name}`
    const condition = requireRecord(value, conditionPath)
    assertSemanticEntry(condition, conditionPath, 'condition', ['name', 'readable', 'arms', 'ast'], [])
    assertString(condition.name, `${conditionPath}.name`)
    assertString(condition.readable, `${conditionPath}.readable`)
    assertArray(condition.arms, `${conditionPath}.arms`)
    condition.arms.forEach((arm, index) => assertConditionArmShape(arm, `${conditionPath}.arms[${index}]`))
    assertConditionAstShape(condition.ast, `${conditionPath}.ast`)
  }
  assertRecord(system.axes, `${path}.axes`)
  for (const [name, axis] of Object.entries(system.axes))
    assertAxis(axis, `${path}.axes.${name}`)
  assertRecord(system.roots, `${path}.roots`)
  for (const [name, value] of Object.entries(system.roots as RecordValue)) {
    const rootPath = `${path}.roots.${name}`
    const root = requireRecord(value, rootPath)
    assertSemanticEntry(root, rootPath, 'root', ['path', 'selector', 'axes'], ['scopes'])
    assertString(root.path, `${rootPath}.path`)
    assertString(root.selector, `${rootPath}.selector`)
    assertStringArray(root.axes, `${rootPath}.axes`)
    if (root.scopes !== undefined)
      assertStringArray(root.scopes, `${rootPath}.scopes`)
  }
  assertRecord(system.tokens, `${path}.tokens`)
  for (const [name, token] of Object.entries(system.tokens))
    assertIntrospectedToken(token, `${path}.tokens.${name}`)
  assertRecord(system.plugins, `${path}.plugins`)
  for (const [name, value] of Object.entries(system.plugins as RecordValue)) {
    const pluginPath = `${path}.plugins.${name}`
    const plugin = requireRecord(value, pluginPath)
    assertSemanticEntry(plugin, pluginPath, 'plugin', ['name', 'version'], ['fingerprint'])
    assertNonEmptyString(plugin.name, `${pluginPath}.name`)
    assertString(plugin.version, `${pluginPath}.version`)
    assertOptionalString(plugin.fingerprint, `${pluginPath}.fingerprint`)
  }
  assertRecord(system.extensions, `${path}.extensions`)
  for (const [name, value] of Object.entries(system.extensions as RecordValue)) {
    const extensionPath = `${path}.extensions.${name}`
    const extension = requireRecord(value, extensionPath)
    assertSemanticEntry(extension, extensionPath, 'extension', ['name', 'version'], ['fingerprint'])
    assertNonEmptyString(extension.name, `${extensionPath}.name`)
    assertString(extension.version, `${extensionPath}.version`)
    assertOptionalString(extension.fingerprint, `${extensionPath}.fingerprint`)
  }
  assertRecord(system.consts, `${path}.consts`)
  for (const [name, value] of Object.entries(system.consts as RecordValue)) {
    const constantPath = `${path}.consts.${name}`
    const constant = requireRecord(value, constantPath)
    assertSemanticEntry(constant, constantPath, 'const', ['name', 'value'], [])
    assertString(constant.name, `${constantPath}.name`)
    assertJsonValueShape(constant.value, `${constantPath}.value`)
  }
  assertRecord(system.constructors, `${path}.constructors`)
  for (const [name, value] of Object.entries(system.constructors as RecordValue)) {
    const constructorPath = `${path}.constructors.${name}`
    const constructor = requireRecord(value, constructorPath)
    assertSemanticEntry(constructor, constructorPath, 'constructor', ['name', 'origin'], [])
    assertString(constructor.name, `${constructorPath}.name`)
    assertOriginShape(constructor.origin, `${constructorPath}.origin`)
  }
  assertRecord(system.utilities, `${path}.utilities`)
  for (const [name, value] of Object.entries(system.utilities as RecordValue)) {
    const utilityPath = `${path}.utilities.${name}`
    const utility = requireRecord(value, utilityPath)
    assertSemanticEntry(utility, utilityPath, 'utility', ['path'], [])
    assertStringArray(utility.path, `${utilityPath}.path`)
  }
  assertRuntimeContractShape(system.runtime)
  assertRecord(system.ruleGroups, `${path}.ruleGroups`)
  for (const [name, value] of Object.entries(system.ruleGroups as RecordValue)) {
    const rulePath = `${path}.ruleGroups.${name}`
    const rule = requireRecord(value, rulePath)
    assertSemanticEntry(rule, rulePath, 'rule-group', ['name', 'selectors', 'fingerprint'], ['description', 'layer', 'order'])
    assertNonEmptyString(rule.name, `${rulePath}.name`)
    assertStringArray(rule.selectors, `${rulePath}.selectors`)
    assertNonEmptyString(rule.fingerprint, `${rulePath}.fingerprint`)
    assertOptionalString(rule.description, `${rulePath}.description`)
    assertOptionalString(rule.layer, `${rulePath}.layer`)
    if (rule.order !== undefined)
      assertInteger(rule.order, `${rulePath}.order`)
  }
  assertArray(system.overwrites, `${path}.overwrites`)
  system.overwrites.forEach((value, index) => {
    const overwritePath = `${path}.overwrites[${index}]`
    const entry = requireRecord(value, overwritePath)
    assertSemanticEntry(entry, overwritePath, 'overwrite', ['operation', 'target', 'paths'], [])
    if (entry.operation !== 'augment' && entry.operation !== 'overwrite')
      fail(`${overwritePath}.operation`, 'must be augment or overwrite')
    if (!['tokens', 'axis', 'conditions', 'consts', 'rules'].includes(String(entry.target)))
      fail(`${overwritePath}.target`, 'contains an invalid overwrite target')
    assertStringArray(entry.paths, `${overwritePath}.paths`)
  })
  assertRecord(system.audits, `${path}.audits`)
  for (const [name, value] of Object.entries(system.audits as RecordValue)) {
    const auditPath = `${path}.audits.${name}`
    const audit = requireRecord(value, auditPath)
    assertSemanticEntry(audit, auditPath, 'audit', ['name', 'level'], [])
    assertString(audit.name, `${auditPath}.name`)
    assertLevel(audit.level, `${auditPath}.level`)
  }
}

function assertAxis(value: unknown, path: string): void {
  const axis = requireRecord(value, path)
  assertSemanticEntry(axis, path, 'axis', ['name', 'modeOrder', 'modes'], ['defaultMode', 'control', 'native'])
  assertString(axis.name, `${path}.name`)
  assertStringArray(axis.modeOrder, `${path}.modeOrder`)
  assertOptionalString(axis.defaultMode, `${path}.defaultMode`)
  if (axis.control !== undefined) {
    const control = requireRecord(axis.control, `${path}.control`)
    assertKeys(control, ['id'], [], `${path}.control`)
    assertNonEmptyString(control.id, `${path}.control.id`)
  }
  if (axis.native !== undefined)
    assertNativePolicyShape(axis.native, `${path}.native`)
  const modes = requireRecord(axis.modes, `${path}.modes`)
  for (const [name, mode] of Object.entries(modes)) {
    const modePath = `${path}.modes.${name}`
    const modeRecord = requireRecord(mode, modePath)
    assertKeys(modeRecord, ['derived', 'arms'], [], modePath)
    assertBoolean(modeRecord.derived, `${modePath}.derived`)
    assertArray(modeRecord.arms, `${modePath}.arms`)
    modeRecord.arms.forEach((arm, index) => {
      const armPath = `${modePath}.arms[${index}]`
      const axisArm = requireRecord(arm, armPath)
      assertKeys(axisArm, ['when', 'mechanism', 'locality', 'placement', 'priority'], ['scopes', 'degraded', 'runtime'], armPath)
      assertString(axisArm.when, `${armPath}.when`)
      assertString(axisArm.mechanism, `${armPath}.mechanism`)
      assertString(axisArm.locality, `${armPath}.locality`)
      assertString(axisArm.placement, `${armPath}.placement`)
      assertInteger(axisArm.priority, `${armPath}.priority`)
      if (axisArm.scopes !== undefined)
        assertStringArray(axisArm.scopes, `${armPath}.scopes`)
      if (axisArm.degraded !== undefined && axisArm.degraded !== true)
        fail(`${armPath}.degraded`, 'must be true when present')
      if (axisArm.runtime !== undefined)
        assertConditionRuntime(axisArm.runtime, `${armPath}.runtime`)
    })
  }
}

function assertIntrospectedToken(value: unknown, path: string): void {
  const token = requireRecord(value, path)
  assertSemanticEntry(token, path, 'token', [
    'path',
    'root',
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
    'preview',
    'metadata',
  ], ['scopes', 'module', 'name', 'registration', 'runtime'])
  assertStringArray(token.path, `${path}.path`)
  assertString(token.root, `${path}.root`)
  if (token.scopes !== undefined)
    assertStringArray(token.scopes, `${path}.scopes`)
  if (token.module !== undefined)
    assertStringArray(token.module, `${path}.module`)
  if (token.name !== undefined)
    assertCssName(token.name, `${path}.name`)
  assertCssTypeShape(token.type, `${path}.type`)
  assertReference(token.reference, `${path}.reference`)
  assertBoolean(token.emit, `${path}.emit`)
  assertBoolean(token.mutable, `${path}.mutable`)
  assertBoolean(token.hasDefault, `${path}.hasDefault`)
  assertExpressionShape(token.expression, `${path}.expression`)
  const inference = requireRecord(token.inference, `${path}.inference`)
  assertKeys(inference, ['reference', 'emit', 'reasons'], [], `${path}.inference`)
  assertString(inference.reference, `${path}.inference.reference`)
  assertString(inference.emit, `${path}.inference.emit`)
  assertStringArray(inference.reasons, `${path}.inference.reasons`)
  const fold = requireRecord(token.fold, `${path}.fold`)
  assertKeys(fold, ['status'], ['val', 'reason'], `${path}.fold`)
  assertString(fold.status, `${path}.fold.status`)
  assertOptionalTokenValue(fold.val, `${path}.fold.val`)
  assertOptionalString(fold.reason, `${path}.fold.reason`)
  assertArray(token.dependencies, `${path}.dependencies`)
  token.dependencies.forEach((entry, index) => assertDependencyShape(entry, `${path}.dependencies[${index}]`))
  const support = requireRecord(token.support, `${path}.support`)
  assertKeys(support, ['requirements'], ['target', 'fallback', 'enhancement'], `${path}.support`)
  assertStringArray(support.requirements, `${path}.support.requirements`)
  assertOptionalString(support.target, `${path}.support.target`)
  assertOptionalString(support.fallback, `${path}.support.fallback`)
  assertOptionalString(support.enhancement, `${path}.support.enhancement`)
  assertArray(token.declarations, `${path}.declarations`)
  token.declarations.forEach((entry, index) => assertDeclarationShape(entry, `${path}.declarations[${index}]`))
  assertArray(token.branches, `${path}.branches`)
  token.branches.forEach((entry, index) => {
    const branchPath = `${path}.branches[${index}]`
    const branch = requireRecord(entry, branchPath)
    assertKeys(branch, ['address', 'val'], ['expression'], branchPath)
    assertSemanticAddressShape(branch.address, `${branchPath}.address`)
    assertTokenValue(branch.val, `${branchPath}.val`)
    if (branch.expression !== undefined)
      assertExpressionShape(branch.expression, `${branchPath}.expression`)
  })
  const portability = requireRecord(token.portability, `${path}.portability`)
  assertKeys(portability, ['status'], ['extension', 'reason'], `${path}.portability`)
  assertString(portability.status, `${path}.portability.status`)
  if (portability.extension !== undefined)
    assertExtensionShape(portability.extension, `${path}.portability.extension`)
  assertOptionalString(portability.reason, `${path}.portability.reason`)
  assertTokenPreviewForIntrospection(token.preview, `${path}.preview`)
  assertJsonRecordShape(token.metadata, `${path}.metadata`)
  if (token.registration !== undefined) {
    const registration = requireRecord(token.registration, `${path}.registration`)
    assertKeys(registration, ['syntax', 'inherits'], ['initialVal'], `${path}.registration`)
    assertString(registration.syntax, `${path}.registration.syntax`)
    assertBoolean(registration.inherits, `${path}.registration.inherits`)
    assertOptionalString(registration.initialVal, `${path}.registration.initialVal`)
  }
  if (token.runtime !== undefined)
    assertTokenRecordRuntimeShape(token.runtime, `${path}.runtime`)
}

function assertModule(value: unknown, path: string): void {
  const module = requireRecord(value, path)
  assertSemanticEntry(module, path, 'module', ['source', 'recipes', 'ports', 'styles', 'escapes', 'contrast', 'tokenUsage'], [])
  assertString(module.source, `${path}.source`)
  assertRecord(module.recipes, `${path}.recipes`)
  for (const [name, recipe] of Object.entries(module.recipes))
    assertRecipe(recipe, `${path}.recipes.${name}`)
  assertRecord(module.ports, `${path}.ports`)
  for (const [name, port] of Object.entries(module.ports))
    assertPort(port, `${path}.ports.${name}`)
  assertRecord(module.styles, `${path}.styles`)
  for (const [name, style] of Object.entries(module.styles))
    assertStyle(style, `${path}.styles.${name}`)
  assertArray(module.escapes, `${path}.escapes`)
  module.escapes.forEach((escape, index) => assertEscape(escape, `${path}.escapes[${index}]`))
  assertArray(module.contrast, `${path}.contrast`)
  module.contrast.forEach((contrast, index) => assertContrast(contrast, `${path}.contrast[${index}]`))
  assertRecord(module.tokenUsage, `${path}.tokenUsage`)
  for (const [name, count] of Object.entries(module.tokenUsage)) {
    assertInteger(count, `${path}.tokenUsage.${name}`)
    if (count < 0)
      fail(`${path}.tokenUsage.${name}`, 'must not be negative')
  }
}

function assertRecipe(value: unknown, path: string): void {
  const recipe = requireRecord(value, path)
  assertSemanticEntry(recipe, path, 'recipe', ['name', 'variants', 'toggles', 'defaults', 'ports'], ['parts'])
  assertString(recipe.name, `${path}.name`)
  if (recipe.parts !== undefined)
    assertStringArray(recipe.parts, `${path}.parts`)
  assertStringArrayRecord(recipe.variants, `${path}.variants`)
  assertStringArray(recipe.toggles, `${path}.toggles`)
  assertStringBooleanRecord(recipe.defaults, `${path}.defaults`)
  assertStringRecord(recipe.ports, `${path}.ports`)
}

function assertPort(value: unknown, path: string): void {
  const port = requireRecord(value, path)
  assertSemanticEntry(port, path, 'port', ['name', 'var', 'type', 'default'], ['validation'])
  assertString(port.name, `${path}.name`)
  assertCssName(port.var, `${path}.var`)
  assertCssTypeShape(port.type, `${path}.type`)
  assertTokenValue(port.default, `${path}.default`)
  if (port.validation !== undefined) {
    const validation = requireRecord(port.validation, `${path}.validation`)
    assertKeys(validation, ['id', 'runtime', 'onInvalid'], ['fallback'], `${path}.validation`)
    assertNonEmptyString(validation.id, `${path}.validation.id`)
    assertString(validation.runtime, `${path}.validation.runtime`)
    assertString(validation.onInvalid, `${path}.validation.onInvalid`)
    assertOptionalString(validation.fallback, `${path}.validation.fallback`)
  }
}

function assertStyle(value: unknown, path: string): void {
  const style = requireRecord(value, path)
  assertSemanticEntry(style, path, 'style', ['class', 'tokens'], ['name'])
  assertString(style.class, `${path}.class`)
  assertOptionalString(style.name, `${path}.name`)
  assertStringArray(style.tokens, `${path}.tokens`)
}

function assertEscape(value: unknown, path: string): void {
  const escape = requireRecord(value, path)
  assertSemanticEntry(escape, path, 'escape', ['form', 'detail'], ['reason', 'layer'])
  if (!['class.standard', 'raw', 'rules', 'unsafe', 'overrides'].includes(String(escape.form)))
    fail(`${path}.form`, 'contains an invalid escape form')
  assertString(escape.detail, `${path}.detail`)
  assertOptionalString(escape.reason, `${path}.reason`)
  assertOptionalString(escape.layer, `${path}.layer`)
}

function assertContrast(value: unknown, path: string): void {
  const contrast = requireRecord(value, path)
  assertSemanticEntry(contrast, path, 'contrast', ['pairing', 'scheme', 'algorithm', 'measured', 'min', 'accepted'], [])
  assertString(contrast.pairing, `${path}.pairing`)
  if (contrast.scheme !== 'light' && contrast.scheme !== 'dark')
    fail(`${path}.scheme`, 'must be light or dark')
  if (contrast.algorithm !== 'apca' && contrast.algorithm !== 'wcag2')
    fail(`${path}.algorithm`, 'must be apca or wcag2')
  assertNumber(contrast.measured, `${path}.measured`)
  assertNumber(contrast.min, `${path}.min`)
  assertBoolean(contrast.accepted, `${path}.accepted`)
}

function assertSemanticEntry(
  value: unknown,
  path: string,
  kind: string,
  required: readonly string[],
  optional: readonly string[],
): void {
  const entry = requireRecord(value, path)
  assertKeys(entry, ['id', 'kind', 'owner', ...required], ['declaredAt', 'description', 'deprecated', ...optional], path)
  assertNonEmptyString(entry.id, `${path}.id`)
  assertExactString(entry.kind, kind, `${path}.kind`)
  const owner = requireRecord(entry.owner, `${path}.owner`)
  assertKeys(owner, ['kind', 'id'], [], `${path}.owner`)
  if (!['system', 'module', 'plugin'].includes(String(owner.kind)))
    fail(`${path}.owner.kind`, 'must be system, module, or plugin')
  assertNonEmptyString(owner.id, `${path}.owner.id`)
  if (entry.declaredAt !== undefined)
    assertDeclaredAt(entry.declaredAt, `${path}.declaredAt`)
  assertOptionalString(entry.description, `${path}.description`)
  assertOptionalString(entry.deprecated, `${path}.deprecated`)
}

function assertIdentities(value: unknown, path: string): void {
  const identities = requireRecord(value, path)
  assertKeys(identities, [...SYSTEM_IDENTITIES], [], path)
  assertIdentity(identities.compatibility, 'vanity-compatibility-1-', `${path}.compatibility`)
  assertIdentity(identities.css, 'vanity-css-1-', `${path}.css`)
  assertIdentity(identities.runtime, 'vanity-runtime-schema-1-', `${path}.runtime`)
  assertIdentity(identities.docs, 'vanity-docs-1-', `${path}.docs`)
}

function assertIdentity(value: unknown, prefix: string, path: string): void {
  if (typeof value !== 'string' || !value.startsWith(prefix))
    fail(path, `must start with ${prefix}`)
}

function assertDeclaredAt(value: unknown, path: string): void {
  const source = requireRecord(value, path)
  assertKeys(source, ['file'], ['line', 'column'], path)
  assertString(source.file, `${path}.file`)
  assertOptionalPositiveInteger(source.line, `${path}.line`)
  assertOptionalPositiveInteger(source.column, `${path}.column`)
}

function assertPolicyRecord(value: unknown, path: string): void {
  const policies = requireRecord(value, path)
  if (Object.hasOwn(policies, 'support'))
    fail(`${path}.support`, 'is not part of the portable policy projection')
  for (const [name, policy] of Object.entries(policies)) {
    if (name === 'tokens') {
      const tokens = requireRecord(policy, `${path}.tokens`)
      assertKeys(tokens, [], ['reference', 'emit'], `${path}.tokens`)
      if (tokens.reference !== undefined && tokens.reference !== 'var' && tokens.reference !== 'val')
        fail(`${path}.tokens.reference`, 'must be var or val')
      if (tokens.emit !== undefined && typeof tokens.emit !== 'boolean')
        fail(`${path}.tokens.emit`, 'must be boolean')
    }
    else if (name === 'layerOrder') {
      assertStringArray(policy, `${path}.layerOrder`)
    }
    else if (name === 'constructors') {
      assertJsonRecordShape(policy, `${path}.constructors`)
    }
    else if (name === 'plugins') {
      assertJsonRecordShape(policy, `${path}.plugins`)
    }
    else {
      assertJsonValueShape(policy, `${path}.${name}`)
    }
  }
}

function assertTokenPreviewForIntrospection(value: unknown, path: string): void {
  const preview = requireRecord(value, path)
  assertString(preview.status, `${path}.status`)
  if (preview.status === 'resolved') {
    assertKeys(preview, ['status', 'val', 'environment'], ['caveats'], path)
    assertString(preview.val, `${path}.val`)
    assertStringRecord(preview.environment, `${path}.environment`)
    if (preview.caveats !== undefined)
      assertStringArray(preview.caveats, `${path}.caveats`)
  }
  else if (preview.status === 'unavailable') {
    assertKeys(preview, ['status', 'reason'], [], path)
    assertString(preview.reason, `${path}.reason`)
  }
  else {
    // The portable preview uses `available`; accepting it here would make the
    // introspection contract ambiguous, so report it as the wrong projection.
    fail(`${path}.status`, 'must be resolved or unavailable')
  }
}

function assertConditionRuntime(value: unknown, path: string): void {
  const runtime = requireRecord(value, path)
  assertKeys(runtime, ['kind', 'name', 'value'], [], path)
  assertExactString(runtime.kind, 'attribute', `${path}.kind`)
  assertString(runtime.name, `${path}.name`)
  if (runtime.value !== null && typeof runtime.value !== 'string')
    fail(`${path}.value`, 'must be a string or null')
}

function assertReference(value: unknown, path: string): void {
  if (value !== 'val' && value !== 'var')
    fail(path, 'must be val or var')
}

function assertTokenValue(value: unknown, path: string): asserts value is string | number | null {
  if (value !== null && typeof value !== 'string' && typeof value !== 'number')
    fail(path, 'must be a string, number, or null')
}

function assertOptionalTokenValue(value: unknown, path: string): void {
  if (value !== undefined)
    assertTokenValue(value, path)
}

function assertCssName(value: unknown, path: string): void {
  assertString(value, path)
  if (!value.startsWith('--'))
    fail(path, 'must begin with --')
}

function assertLevel(value: unknown, path: string): void {
  if (!['off', 'warn', 'error'].includes(String(value)))
    fail(path, 'must be off, warn, or error')
}

function assertStringArrayRecord(value: unknown, path: string): void {
  const record = requireRecord(value, path)
  for (const [key, child] of Object.entries(record))
    assertStringArray(child, `${path}.${key}`)
}

function assertStringBooleanRecord(value: unknown, path: string): void {
  const record = requireRecord(value, path)
  for (const [key, child] of Object.entries(record)) {
    if (typeof child !== 'string' && typeof child !== 'boolean')
      fail(`${path}.${key}`, 'must be a string or boolean')
  }
}

function assertStringRecord(value: unknown, path: string): asserts value is Record<string, string> {
  const record = requireRecord(value, path)
  for (const [key, child] of Object.entries(record))
    assertString(child, `${path}.${key}`)
}

function assertStringArray(value: unknown, path: string): asserts value is string[] {
  assertArray(value, path)
  value.forEach((child, index) => assertString(child, `${path}[${index}]`))
}

function assertArray(value: unknown, path: string): asserts value is unknown[] {
  if (!Array.isArray(value))
    fail(path, 'must be an array')
}

function assertRecord(value: unknown, path: string): asserts value is RecordValue {
  requireRecord(value, path)
}

function requireRecord(value: unknown, path: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(path, 'must be an object')
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    fail(path, 'must be a plain object')
  return value as RecordValue
}

function assertKeys(value: RecordValue, required: readonly string[], optional: readonly string[], path: string): void {
  const allowed = new Set([...required, ...optional])
  const unknown = Object.keys(value).find(key => !allowed.has(key))
  if (unknown !== undefined)
    fail(`${path}.${unknown}`, 'is not a property in the current contract')
  const missing = required.find(key => !Object.hasOwn(value, key))
  if (missing !== undefined)
    fail(`${path}.${missing}`, 'is required')
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

function assertExactString(value: unknown, expected: string, path: string): void {
  if (value !== expected)
    fail(path, `must be '${expected}'`)
}

function assertExactNumber(value: unknown, expected: number, path: string): void {
  if (value !== expected)
    fail(path, `must be ${expected}`)
}

function assertBoolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== 'boolean')
    fail(path, 'must be a boolean')
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

function assertOptionalPositiveInteger(value: unknown, path: string): void {
  if (value === undefined)
    return
  assertInteger(value, path)
  if (value < 1)
    fail(path, 'must be at least 1')
}

function fail(path: string, message: string): never {
  throw new VanityError({
    code: 'VANITY_MANIFEST_INVALID',
    message: `invalid Manifest v4 at ${path}: ${message}`,
    path: [path],
    fix: 'regenerate the manifest with Vanity or correct the reported field',
  })
}
