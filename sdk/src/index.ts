// Exports are ordered by source module. Each heading names the public domain;
// the order itself stays alphabetical so lint makes accidental drift visible.

export { unsafe } from './atoms/handle'

// ─── Atoms: finite declared utility selection ───────────────────────────────

export type {
  VanityAtomInput,
  VanityAtomKey,
  VanityAtoms,
  VanityAtomsFactory,
  VanityAtomsOptions,
  VanityAtomsProps,
  VanityAtomValue,
  VanityAtomValues,
  VanityUnsafeValue,
} from './atoms/types'

export { fromEntries, mapRecord, range } from './collections'

// ─── CSS authoring: the style-rule types ─────────────────────────────────────

export type {
  VanityAtRules,
  VanityClassEmitter,
  VanityCssPropertyName,
  VanityCustomProperties,
  VanityDeclarations,
  VanityFontFaceFunction,
  VanityFontFaceRule,
  VanityFragment,
  VanityFragmentFactory,
  VanityKeyframesFunction,
  VanityKeyframesRule,
  VanityKeyframeStep,
  VanityKeyframeTime,
  VanityNestedRule,
  VanityOmit,
  VanityPropertyArms,
  VanityRawEmitter,
  VanityRawValue,
  VanityRuleEntry,
  VanityRuleInput,
  VanityRulesEmitter,
  VanitySelectorRules,
  VanityStyleRule,
  VanityStyleValue,
  VanityTokenDeclarations,
  VanityVarReference,
} from './css/types'

// ─── Diagnostics: the error contract every domain shares ────────────────────

export {
  didYouMean,
  formatVanityDiagnostic,
  normalizeDiagnostic,
  reportDiagnostics,
  VanityError,
} from './diagnostics'
export type {
  VanityDiagnostic,
  VanityDiagnosticCode,
  VanityDiagnosticFix,
  VanityDiagnosticInput,
  VanityDiagnosticRelated,
  VanityDiagnosticRelatedInput,
  VanityDiagnosticSink,
} from './diagnostics'

// ─── Open system: the canonical authoring environment ────────────────────────

export {
  VANITY_BUILTIN_CONSTRUCTOR_NAMES,
  VANITY_SYSTEM_MEMBERS,
  VANITY_SYSTEM_SURFACE_VERSION,
} from './engine/reservations'
export type { VanityBuiltinConstructorName, VanitySystemMember } from './engine/reservations'

export type { VanityAuditConfig, VanityAuditKind, VanityAuditLevel } from './internal/inspect'
export type { VanityDtcgCodec, VanityJsonValue } from './internal/interchange'
export { exportDesignTokens, importDesignTokens, VANITY_DTCG_EXTENSION, VANITY_DTCG_EXTENSION_VERSION } from './introspect/dtcg'
export type {
  VanityDtcgAuthoredExtension,
  VanityDtcgAuthoredToken,
  VanityDtcgDocument,
  VanityDtcgEncodedValue,
  VanityDtcgExportMode,
  VanityDtcgExportOptions,
  VanityDtcgImportOptions,
} from './introspect/dtcg'
export type {
  VanityExplanation,
  VanityExplanationFor,
  VanityTokenExplanation,
} from './introspect/explain'
export { formatExplanation } from './introspect/semantic'
export {
  VANITY_INTROSPECTION_FORMAT,
  VANITY_INTROSPECTION_VERSION,
} from './introspect/system'
export type {
  VanityDeclaredAt,
  VanityIntrospectedToken,
  VanitySemanticEntry,
  VanitySemanticOwner,
  VanitySystemMapV1,
} from './introspect/system'

// ─── Introspection and design-token interchange ─────────────────────────────

export { propertyAliases } from './plugins/propertyAliases'
export type {
  VanityPropertyAliasConfig,
  VanityPropertyAliasExposure,
  VanityPropertyAliasOptions,
} from './plugins/propertyAliases'
export { ports } from './ports/ports'

export type {
  VanityPort,
  VanityPortBindingOptions,
  VanityPortDataTypeOf,
  VanityPortDecValue,
  VanityPortDefault,
  VanityPortDefinition,
  VanityPortFactory,
  VanityPortInput,
  VanityPortKind,
  VanityPortMeta,
  VanityPortOptions,
  VanityPortStyle,
  VanityPortTokenReference,
  VanityPortValidation,
  VanityPortValidationMeta,
  VanityPortValue,
  VanityPortWiden,
} from './ports/types'

// ─── Ports: the typed runtime boundary ───────────────────────────────────────

export { fromTokenGroup } from './recipes/fromTokenGroup'
export type { VanityTokenGroup } from './recipes/fromTokenGroup'

// ─── Recipes: variants, toggles, anatomy, published ports ────────────────────

export type {
  VanityAnatomy,
  VanityAnatomyArms,
  VanityAnatomyCompoundEntry,
  VanityAnatomyFactory,
  VanityAnatomyOptions,
  VanityAnatomyRule,
  VanityAnatomyRuleInput,
  VanityCompoundEntry,
  VanityProps,
  VanityRecipe,
  VanityRecipeArm,
  VanityRecipeFactory,
  VanityRecipeOptions,
  VanityRecipeProps,
  VanityRecipeSelection,
} from './recipes/types'
export type {
  VanityAbsoluteAxisConditionOptions,
  VanityAxisAuthoringHelpers,
  VanityAxisConditionOptions,
  VanityAxisConfig,
  VanityAxisControl,
  VanityAxisControlRoot,
  VanityAxisDefinition,
  VanityAxisDefinitions,
  VanityAxisLocality,
  VanityAxisMechanism,
  VanityAxisModeInput,
  VanityAxisName,
  VanityAxisRegistry,
  VanityAxisRegistryDescription,
  VanityAxisTrigger,
  VanityAxisTriggerArm,
  VanityDefaultAxisMode,
  VanityNativeSchemePolicy,
  VanityOpenAxisConfig,
  VanityOpenAxisModes,
  VanitySchemeAxisOptions,
} from './system/axes'
export { axis, colorSchemes } from './system/axes'

export {
  aria,
  condition,
  container,
  data,
  media,
  moduleRoot,
  schemeIs,
  scope,
  selector,
  supports,
  systemRoot,
  thisMode,
} from './system/conditions'
export type {
  VanityBaseConditionInputs,
  VanityBaseConditionName,
  VanityCondition,
  VanityConditionArm,
  VanityConditionAst,
  VanityConditionInput,
  VanityConditionKey,
  VanityConditionKeyFor,
  VanityConditionKeyHover,
  VanityConditionKeys,
  VanityConditionScalar,
  VanityFluentCondition,
  VanityPartConditionKeyHover,
  VanityRangeQuery,
  VanityScopeCondition,
  VanityStructuredQuery,
} from './system/conditions'

// ─── The system: createSystem, conditions, layers ────────────────────────────

export type {
  VanityInProcessSystemContract,
  VanityOverwriteProvenance,
  VanityPortableSystemV1,
  VanitySystemIdentities,
} from './system/contract'
export { VANITY_DEFAULT_LAYERS } from './system/createSystem'
export type {
  VanityDefaultLayers,
  VanitySystemConditionName,
} from './system/createSystem'

export type {
  VanityCustomPropertyEntries,
  VanityCustomPropertyReference,
  VanityCustomPropertyTarget,
  VanityRuntimeAxes,
  VanityRuntimeController,
  VanityRuntimeControllerFactory,
  VanityRuntimeCycleOptions,
  VanityRuntimeDiagnostic,
  VanityRuntimeDiagnosticCode,
  VanityRuntimeInput,
  VanityRuntimeInspection,
  VanityRuntimeOptions,
  VanityRuntimeProps,
  VanityRuntimeQueryScope,
  VanityRuntimeReconciliation,
  VanityRuntimeRootContract,
  VanityRuntimeRootProps,
  VanityRuntimeSnapshotOverride,
  VanityRuntimeSnapshotV1,
  VanityRuntimeStyleDeclaration,
  VanityRuntimeStyles,
  VanityRuntimeTarget,
  VanityRuntimeTokens,
  VanitySnapshotFrom,
} from './system/live'

export {
  defineAxes,
  defineConditions,
  defineConstructor,
  defineConstructors,
  defineConsts,
  definePolicies,
  defineRules,
  defineUtils,
} from './system/modules'

export type {
  VanityAxisModuleInput,
  VanityConstructorDefinition,
  VanityConstructorFamily,
  VanityConstructorMembers,
  VanityDefinitionKind,
  VanityDefinitionModule,
  VanitySystemRule,
  VanityUtilTree,
} from './system/modules'

export { createSystem, definePlugin } from './system/openSystem'
export type {
  VanityAxisPatch,
  VanityConsolidateOptions,
  VanityConstructorPolicies,
  VanityConstructorPolicy,
  VanityConstructorRestriction,
  VanityLockedSystem,
  VanityLogicalTokenHandle,
  VanityLogicalTokens,
  VanityOpenSystem,
  VanityOpenSystemBase,
  VanityOpenSystemMethods,
  VanityPluginDefinition,
  VanityPluginRequirements,
  VanityPluginSetupSystem,
  VanityPolicies,
  VanitySystem,
  VanitySystemEnvironment,
  VanitySystemPlugin,
} from './system/openSystem'

// ─── Tokens: graph, liveness, axes, checks, and overrides ────────────────────

export { defineTokens } from './tokens/builder'
export type {
  VanityPortableTokenBuilder,
  VanityTdefFactory,
  VanityTokenAxisMethods,
  VanityUnifiedTokenBuilder as VanityTokenBuilder,
  VanityTokenDefinitionValue,
  VanityTokenTreeGraph,
} from './tokens/builder'

export type {
  VanityChannelOperation,
  VanityColorChannel,
  VanityColorFunction,
  VanityColorFunctionChannels,
  VanityColorMixItem,
  VanityColorMixOptions,
  VanityColorMixPercentage,
  VanityCssColorSpace,
  VanityHslChannels,
  VanityHslFunction,
  VanityHueChannel,
  VanityHwbChannels,
  VanityHwbFunction,
  VanityImage,
  VanityLabChannels,
  VanityLabFunction,
  VanityLchChannels,
  VanityLchFunction,
  VanityLegibleOptions,
  VanityLightDarkImage,
  VanityNumericColorChannel,
  VanityOklabChannels,
  VanityOklabFunction,
  VanityOklchChannels,
  VanityOklchFunction,
  VanityPredefinedColorSpace,
  VanityRgbChannels,
  VanityRgbFunction,
} from './tokens/color'
export type { VanityLinearScaleOptions, VanityModularScaleOptions, VanityScale } from './tokens/scale'
export type {
  VanityAuthoredColor,
  VanityAuthoredInterpolatedColor,
  VanityCanonicalTokens,
  VanityCheck,
  VanityColor,
  VanityColorInterpolationSpace,
  VanityColorish,
  VanityColorMode,
  VanityColorToken,
  VanityColorTokenHandle,
  VanityConfiguredToken,
  VanityConfiguredTokenShape,
  VanityContrast,
  VanityContrastGuarantee,
  VanityContrastToken,
  VanityDefaultTokenPolicy,
  VanityDerived,
  VanityGraphInput,
  VanityHueInterpolation,
  VanityInterpolatedColor,
  VanityInvalidRuntimeValuePolicy,
  VanityModeOf,
  VanityNamesOf,
  VanityPolarColorSpace,
  VanityResolvedTokens,
  VanityRuntimeValidationMode,
  VanityStandardSchemaIssue,
  VanityStandardSchemaV1,
  VanityTokenBranchHandle,
  VanityTokenCase,
  VanityTokenConfig,
  VanityTokenDeclarationError,
  VanityTokenDeprecation,
  VanityTokenDerivationStage,
  VanityTokenFactory,
  VanityTokenFallback,
  VanityTokenHandle,
  VanityTokenHandleAny,
  VanityTokenHandleOf,
  VanityTokenMetadata,
  VanityTokenMetadataValue,
  VanityTokenMode,
  VanityTokenModule,
  VanityTokenModuleOptions,
  VanityTokenOverrides,
  VanityTokenPolicy,
  VanityTokenReference,
  VanityTokenRegistration,
  VanityTokens,
  VanityTokensOptions,
  VanityTokenValidation,
  VanityTypedNoDefaultTokenFactory,
  VanityValueToken,
  VanityVarsOf,
} from './tokens/types'

// ─── CSS values: canonical public contracts and types ──────────────────

export type { VanityCustomProperty, VanityCustomPropertyOptions } from './values/customProperty'
export {
  alpha,
  defaultAngle as angle,
  calc,
  defaultChannel as channel,
  clamp,
  color,
  colorMix,
  defaultCustomProperty as customProperty,
  darken,
  desaturate,
  displayP3,
  defaultFlex as flex,
  fluid,
  defaultFrequency as frequency,
  grid,
  hsl,
  hwb,
  defaultInteger as integer,
  interpolate,
  lab,
  lch,
  legibleOn,
  lightDark,
  lighten,
  max,
  min,
  mix,
  defaultNumber as number,
  oklab,
  oklch,
  defaultPercent as percent,
  defaultRawValue as rawValue,
  defaultResolution as resolution,
  rgb,
  rotate,
  saturate,
  defaultTime as time,
} from './values/defaultEngine'
export type { VanityCanonicalConstructors, VanityConstructors } from './values/defaultEngine'
export type {
  VanityCssOperationDefinition,
  VanityCssValueDefinition,
  VanityCssValueRecipe,
  VanityExtensionInput,
} from './values/extensions'
export { defineCssOperation, defineCssValue } from './values/extensions'
export type { VanityFluidOptions, VanityInterpolationDimension } from './values/interpolate'
export type {
  VanityCalc,
  VanityDimensionOf,
  VanityMathDimension,
  VanityMathValue,
  VanityProductDimension,
  VanityQuotientDimension,
  VanitySumDimension,
} from './values/math'
export {
  createCssValueSerializer,
  defineCssSupportTarget,
  VANITY_DEFAULT_CSS_SUPPORT,
} from './values/protocol'
export type {
  VanityCssFeature,
  VanityCssSupportTarget,
  VanityExpressionKind,
  VanityExtensionIdentity,
  VanityFoldContext,
  VanityFoldRefusal,
  VanityFoldResult,
  VanityReference,
  VanitySerializeContext,
  VanitySource,
} from './values/protocol'
export type { VanityRawValueConstructors } from './values/raw'
export type {
  VanityCssDataType,
  VanityCssInput,
  VanityCssReference,
  VanityCssValue,
  VanityDataTypeOf,
  VanityResolution,
  VanitySelfValue,
  VanitySystemValue,
  VanityToken,
  VanityTokenInput,
  VanityValue,
} from './values/types'
export { length } from './values/units'
export type {
  VanityAngleConstructor,
  VanityAngleUnit,
  VanityFlexConstructor,
  VanityFlexUnit,
  VanityFrequencyConstructor,
  VanityFrequencyUnit,
  VanityLengthConstructor,
  VanityLengthUnit,
  VanityResolutionConstructor,
  VanityResolutionUnit,
  VanityTimeConstructor,
  VanityTimeUnit,
  VanityUnitValue,
} from './values/units'
