//#region ../../sdk/dist/runtime.mjs
var VANITY_VALUE = Symbol.for("vanity.value");
function isVanityValue(value) {
	return (typeof value === "object" || typeof value === "function") && value !== null && VANITY_VALUE in value;
}
function isCssValue(value) {
	return isVanityValue(value) && "css" in value;
}
function serializeCssText(value) {
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new RangeError(`[vanity] a CSS number must be finite; received ${value}`);
		return String(Object.is(value, -0) ? 0 : value);
	}
	if (typeof value === "string") {
		if (value.trim().length === 0) throw new TypeError("[vanity] a CSS value cannot be empty");
		return value;
	}
	if (isCssValue(value)) return value.css;
	return "var" in value ? value.var : String(value);
}
function getVanityHandleSymbol() {
	return Symbol.for("vanity.tokenHandle");
}
function getVanityBranchHandleSymbol() {
	return Symbol.for("vanity.tokenBranchHandle");
}
function getVanityRuntimeAddressSymbol() {
	return Symbol.for("vanity.runtimeAddress");
}
function getCaseBranchesSymbol() {
	return Symbol.for("vanity.caseBranches");
}
function createHandle(meta) {
	const state = {
		...meta,
		reference: meta.reference ?? "var",
		emit: meta.emit ?? true,
		mutable: meta.mutable ?? false,
		type: meta.type ?? "unknown"
	};
	const variable = `var(${meta.name})`;
	const axes = {};
	const cases = /* @__PURE__ */ new Map();
	const render = () => state.reference === "val" && state.value !== void 0 ? String(state.value) : variable;
	const handle = (() => render());
	Object.defineProperty(handle, getVanityHandleSymbol(), { value: true });
	Object.defineProperty(handle, handleMetadataSymbol(), { value: state });
	if (meta.runtime) Object.defineProperty(handle, getVanityRuntimeAddressSymbol(), {
		configurable: true,
		value: meta.runtime
	});
	defineGetter(handle, "$name", () => state.name);
	defineMutable(handle, "$val", () => state.value, (value) => state.value = value);
	defineGetter(handle, "$var", () => (fallback) => {
		if (fallback === void 0) return variable;
		const serialized = serializeFallback(fallback);
		return `var(${state.name}, ${serialized})`;
	});
	defineGetter(handle, "$path", () => state.path);
	defineGetter(handle, "$type", () => state.type);
	defineGetter(handle, "$reference", () => state.reference);
	defineGetter(handle, "$emit", () => state.emit);
	defineGetter(handle, "$mutable", () => state.mutable);
	Object.defineProperty(handle, "$dec", {
		configurable: true,
		enumerable: false,
		get: () => Object.freeze({ [state.path.split(".").at(-1) ?? state.path]: handle })
	});
	defineMutable(handle, "$description", () => state.description, (value) => state.description = value);
	defineMutable(handle, "$deprecated", () => state.deprecated, (value) => state.deprecated = value);
	defineMutable(handle, "$metadata", () => state.metadata, (value) => state.metadata = value);
	defineGetter(handle, "$register", () => state.register);
	defineGetter(handle, "$validate", () => state.validate);
	defineGetter(handle, "$axes", () => axes);
	defineGetter(handle, "$case", () => (when) => {
		const branch = cases.get(addressKey$1(when));
		if (!branch) throw new TypeError(`[vanity] ${state.path} has no authored case for ${JSON.stringify(when)}`);
		return branch;
	});
	defineGetter(handle, "toString", () => render);
	if (meta.axes || meta.cases) {
		attachCaseBranches(handle);
		for (const [axis, modes] of Object.entries(meta.axes ?? {})) for (const [mode, branch] of Object.entries(modes)) attachAxisBranch(handle, axis, mode, createBranchHandle(branch.value, branch));
		for (const branch of meta.cases ?? []) attachCaseBranch(handle, branch.when, createBranchHandle(branch.value, branch));
	}
	return handle;
}
function readHandleMeta(handle) {
	const meta = handle[handleMetadataSymbol()];
	if (!meta) throw new TypeError("[vanity] value is not a canonical token handle");
	return meta;
}
function readHandlePath(handle) {
	return readHandleMeta(handle).path;
}
function handleMetadataSymbol() {
	return Symbol.for("vanity.tokenHandle.meta");
}
function createBranchHandle(value, meta = {}) {
	const state = {
		value,
		...meta
	};
	const render = () => state.value === void 0 ? "" : String(state.value);
	const handle = (() => render());
	Object.defineProperty(handle, getVanityBranchHandleSymbol(), { value: true });
	if (meta.runtime) Object.defineProperty(handle, getVanityRuntimeAddressSymbol(), {
		configurable: true,
		value: meta.runtime
	});
	defineMutable(handle, "$val", () => state.value, (next) => state.value = next);
	defineMutable(handle, "$description", () => state.description, (next) => state.description = next);
	defineMutable(handle, "$metadata", () => state.metadata, (next) => state.metadata = next);
	defineGetter(handle, "toString", () => render);
	return handle;
}
function attachAxisBranch(handle, axis, mode, branch) {
	const axes = handle.$axes;
	axes[axis] ??= {};
	axes[axis][mode] = branch;
}
function attachCaseBranch(handle, when, branch) {
	const symbol = getCaseBranchesSymbol();
	const owner = handle;
	let cases = owner[symbol];
	if (!cases) {
		cases = /* @__PURE__ */ new Map();
		Object.defineProperty(owner, symbol, { value: cases });
	}
	cases.set(addressKey$1(when), branch);
}
function attachCaseBranches(handle) {
	const symbol = getCaseBranchesSymbol();
	const owner = handle;
	const cases = owner[symbol] ?? /* @__PURE__ */ new Map();
	if (!owner[symbol]) Object.defineProperty(owner, symbol, { value: cases });
	Object.defineProperty(handle, "$case", {
		configurable: true,
		get: () => (when) => {
			const branch = cases.get(addressKey$1(when));
			if (!branch) throw new TypeError(`[vanity] ${readHandlePath(handle)} has no authored case for ${JSON.stringify(when)}`);
			return branch;
		}
	});
}
function isHandle(value) {
	return typeof value === "function" && value[getVanityHandleSymbol()] === true;
}
function isBranchHandle(value) {
	return typeof value === "function" && value[getVanityBranchHandleSymbol()] === true;
}
function runtimeAddressOf(value) {
	if (!isHandle(value) && !isBranchHandle(value)) return void 0;
	return value[getVanityRuntimeAddressSymbol()];
}
function serializeFallback(value) {
	if (isHandle(value) || isBranchHandle(value)) return String(value);
	return serializeCssText(value);
}
function addressKey$1(when) {
	return Object.entries(when).sort(([left], [right]) => left.localeCompare(right)).map(([axis, mode]) => `${axis}\0${mode}`).join("");
}
function defineGetter(target, key, get) {
	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: true,
		get
	});
}
function defineMutable(target, key, get, set) {
	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: true,
		get,
		set
	});
}
var BOUND_RUNTIMES = /* @__PURE__ */ new WeakMap();
function createRuntimeServices(contract, embeddedSchemas = {}, embeddedControls = {}) {
	const reconcile = (snapshot, options = {}) => reconcileSnapshot(contract, snapshot, mergeSchemas(embeddedSchemas, options.validators), options);
	const runtimeStyle = (snapshot, options = {}) => {
		return projectStyles(contract, reconcile(snapshot, options).snapshot);
	};
	const runtimeProps = (snapshot, options = {}) => {
		return projectProps(contract, reconcile(snapshot, options).snapshot);
	};
	return {
		runtime: ((options = {}) => {
			assertRuntimeOptions(options);
			return bindRuntime(contract, {
				...options,
				controls: {
					...embeddedControls,
					...options.controls
				}
			}, mergeSchemas(embeddedSchemas, options.validators));
		}),
		snapshotFrom: ((configure, options = {}) => {
			if (typeof configure !== "function") throw new TypeError("[vanity] snapshotFrom() needs a callback that configures the seed runtime");
			const runtime = bindRuntime(contract, {
				...options,
				controls: {
					...embeddedControls,
					...options.controls
				}
			}, mergeSchemas(embeddedSchemas, options.validators), true);
			configure(runtime);
			return runtime.snapshot();
		}),
		reconcileRuntimeSnapshot: reconcile,
		runtimeStyle,
		runtimeProps
	};
}
function assertRuntimeOptions(options) {
	if (isRuntimeTarget(options)) throw new TypeError("[vanity] ds.runtime() resolves declared roots; use runtime({ within: element }) or runtime().bindRoot(path, element)");
	if (!isPlainObject(options)) throw new TypeError("[vanity] ds.runtime() accepts only an options object; selector strings are not accepted");
}
function restoreRuntimeControllerFactory(contract) {
	return createRuntimeServices(contract).runtime;
}
function restoreSnapshotFrom(contract) {
	return createRuntimeServices(contract).snapshotFrom;
}
function restoreRuntimeReconciler(contract) {
	return createRuntimeServices(contract).reconcileRuntimeSnapshot;
}
function restoreRuntimeStyle(contract) {
	return createRuntimeServices(contract).runtimeStyle;
}
function restoreRuntimeProps(contract) {
	return createRuntimeServices(contract).runtimeProps;
}
function bindRuntime(contract, options, schemas, memory = false) {
	const family = `${contract.prefix}\0${contract.root}`;
	const scope = memory ? void 0 : getResolutionScope(options);
	const bindings = scope === void 0 ? void 0 : BOUND_RUNTIMES.get(scope) ?? /* @__PURE__ */ new Map();
	const prior = bindings?.get(family);
	const effectiveOptions = options.initial === void 0 && prior ? {
		...options,
		initial: getRuntimeSnapshot(prior.contract, prior)
	} : options;
	if (prior) prior.active = false;
	const state = {
		contract,
		roots: new Map(contract.roots.map((root) => [root.path, {
			contract: root,
			targets: memory ? [createMemoryRuntimeTarget()] : [],
			resolved: memory,
			bound: memory
		}])),
		...scope === void 0 ? {} : { within: scope },
		overrides: /* @__PURE__ */ new Map(),
		modes: /* @__PURE__ */ new Map(),
		diagnostics: [],
		options: effectiveOptions,
		memory,
		active: true
	};
	if (bindings && scope) {
		bindings.set(family, state);
		BOUND_RUNTIMES.set(scope, bindings);
	}
	const initial = effectiveOptions.initial === void 0 ? createEmptySnapshot(contract) : reconcileSnapshot(contract, effectiveOptions.initial, schemas, effectiveOptions);
	if ("diagnostics" in initial) state.diagnostics.push(...initial.diagnostics);
	const snapshot = "snapshot" in initial ? initial.snapshot : initial;
	if (effectiveOptions.initial !== void 0) restoreRuntimeState(contract, state, snapshot);
	return createRuntimeController(contract, state, schemas);
}
function createMemoryRuntimeTarget() {
	const values = /* @__PURE__ */ new Map();
	const attributes = /* @__PURE__ */ new Map();
	return {
		style: {
			setProperty(name, value) {
				values.set(name, value);
			},
			removeProperty(name) {
				const previous = values.get(name) ?? "";
				values.delete(name);
				return previous;
			},
			getPropertyValue(name) {
				return values.get(name) ?? "";
			}
		},
		setAttribute(name, value) {
			attributes.set(name, value);
		},
		removeAttribute(name) {
			attributes.delete(name);
		},
		getAttribute(name) {
			return attributes.get(name) ?? null;
		}
	};
}
function createRuntimeController(contract, state, schemas, queued) {
	const emit = (mutation) => {
		if (queued) queued.push(mutation);
		else applyMutations(state, [mutation]);
	};
	const controller = {
		t: runtimeTree(contract, state, schemas, emit),
		axes: runtimeAxes(contract, state, emit),
		get diagnostics() {
			return Object.freeze([...state.diagnostics]);
		},
		refreshRoots(path) {
			assertActive(state);
			if (path === void 0) {
				for (const root of state.roots.values()) {
					resolveRuntimeRoot(state, root, true);
					applyStateToRoot(state, root);
				}
				return;
			}
			const root = runtimeRoot(state, path);
			resolveRuntimeRoot(state, root, true);
			applyStateToRoot(state, root);
		},
		bindRoot(path, element) {
			assertActive(state);
			assertRuntimeTarget(element);
			const root = runtimeRoot(state, path);
			root.targets = [element];
			root.resolved = true;
			root.bound = true;
			applyStateToRoot(state, root);
		},
		transaction(configure) {
			assertActive(state);
			if (typeof configure !== "function") throw new TypeError("[vanity] runtime.transaction() needs a callback");
			const mutations = [];
			configure(createRuntimeController(contract, state, schemas, mutations));
			applyMutations(state, mutations);
		},
		hydrate(input) {
			assertActive(state);
			const result = reconcileSnapshot(contract, input, schemas, state.options);
			state.diagnostics.push(...result.diagnostics);
			restoreRuntimeState(contract, state, result.snapshot);
			return result;
		},
		snapshot: () => getRuntimeSnapshot(contract, state),
		inspect: () => inspectRuntime(contract, state)
	};
	return Object.freeze(controller);
}
function runtimeAxes(contract, state, emit) {
	const tree = {};
	for (const axis of contract.axisOrder) {
		const definition = contract.axes[axis];
		const switchTo = (mode) => emit(prepareMode(contract, state, axis, mode));
		const actions = {
			$switchTo: switchTo,
			$current: () => getCurrentMode(contract, state, axis),
			$cycle: (options = {}) => {
				const modes = definition.modes.filter((mode) => definition.control !== void 0 || definition.attribute?.values[mode] !== void 0).filter((mode) => !options.exclude?.includes(mode));
				if (modes.length === 0) throw new TypeError(`[vanity] runtime axis '${axis}' has no activatable modes left to cycle`);
				const current = getCurrentMode(contract, state, axis);
				const next = current === void 0 ? definition.defaultMode && modes.includes(definition.defaultMode) ? definition.defaultMode : modes[0] : modes[(modes.indexOf(current) + 1) % modes.length] ?? modes[0];
				switchTo(next);
			}
		};
		for (const mode of definition.modes) if (definition.control !== void 0 || definition.attribute?.values[mode] !== void 0) actions[mode] = Object.freeze({ $activate: () => switchTo(mode) });
		tree[axis] = Object.freeze(actions);
	}
	return Object.freeze(tree);
}
function prepareMode(contract, state, axis, mode) {
	assertActive(state);
	const definition = contract.axes[axis];
	if (!definition || !definition.modes.includes(mode)) throw new TypeError(`[vanity] runtime axis '${axis}' has no mode '${mode}'`);
	const value = definition.attribute?.values[mode];
	if ((!definition.attribute || value === void 0) && !definition.control) throw new TypeError(`[vanity] runtime axis '${axis}' cannot activate mode '${mode}'`);
	if (definition.control && !state.options.controls?.[definition.control.id]) throw new TypeError(`[vanity] runtime axis '${axis}' needs control '${definition.control.id}' in runtime({ controls })`);
	return {
		kind: "mode",
		axis,
		mode,
		...definition.attribute === void 0 || value === void 0 ? {} : {
			name: definition.attribute.name,
			value
		}
	};
}
function getCurrentMode(contract, state, axis) {
	assertActive(state);
	const definition = contract.axes[axis];
	if (!definition) throw new TypeError(`[vanity] runtime has no axis '${axis}'`);
	const control = definition.control && state.options.controls?.[definition.control.id];
	if (!definition.attribute && !control) return void 0;
	if (state.memory) return state.modes.get(axis);
	const readings = [];
	for (const root of getRootsForAxis(state, axis)) {
		const targets = getTargetsForRoot(state, root, false);
		for (const [index, target] of targets.entries()) {
			const mode = control ? control.read(target) : Object.entries(definition.attribute.values).find(([, expected]) => expected === (target.getAttribute?.(definition.attribute.name) ?? null))?.[0];
			const knownMode = mode === void 0 || definition.modes.includes(mode) ? mode : void 0;
			if (mode !== void 0 && knownMode === void 0 && (state.options.dev ?? inferDevelopmentMode())) appendRuntimeDiagnostic(state, {
				code: "VANITY_RUNTIME_UNKNOWN_MODE",
				message: `runtime control for axis '${axis}' read unknown mode '${mode}' at '${root.contract.path}'`,
				axis,
				mode,
				rootPath: root.contract.path
			});
			readings.push({
				root: targets.length === 1 ? root.contract.path : `${root.contract.path}[${index}]`,
				mode: knownMode
			});
		}
	}
	if (readings.length === 0) return void 0;
	const first = readings[0].mode;
	if (readings.every((reading) => reading.mode === first)) return first;
	if (state.options.dev ?? inferDevelopmentMode()) appendRuntimeDiagnostic(state, {
		code: "VANITY_RUNTIME_MODE_DISAGREEMENT",
		message: `runtime axis '${axis}' disagrees across roots: ${readings.map((reading) => `${reading.root}=${reading.mode ?? "unknown"}`).join(", ")}`,
		axis
	});
}
function inspectRuntime(contract, state) {
	const snapshot = getRuntimeSnapshot(contract, state);
	return Object.freeze({
		system: contract.system,
		root: contract.root,
		active: state.active,
		roots: Object.freeze([...state.roots.values()].map((root) => Object.freeze({
			path: root.contract.path,
			selector: root.contract.selector,
			status: root.bound && !state.memory ? "bound" : !root.resolved ? "unresolved" : root.targets.length === 0 ? "missing" : root.targets.length === 1 ? "resolved" : "ambiguous",
			matches: root.targets.length,
			axes: root.contract.axes
		}))),
		modes: snapshot.modes,
		overrides: Object.freeze(snapshot.overrides.flatMap((override) => {
			const token = tokenByPath(contract, override.token);
			if (!token) return [];
			const slot = getTokenSlot(token, override.address);
			if (!slot) return [];
			const owner = state.roots.get(token.rootPath);
			const applied = owner?.targets.length === 1 ? owner.targets[0].style.getPropertyValue?.(slot) : void 0;
			return [Object.freeze({
				token: override.token,
				address: override.address,
				val: override.val,
				name: token.name,
				slot,
				tokenRootPath: token.rootPath,
				tokenRoot: token.root,
				...applied === void 0 ? {} : { applied }
			})];
		})),
		diagnostics: Object.freeze([...state.diagnostics])
	});
}
function runtimeTree(contract, state, schemas, emit) {
	const tree = {};
	for (const token of contract.tokens) {
		const axes = {};
		const cases = [];
		for (const branch of token.branches) {
			const branchMeta = {
				...branch.value === void 0 ? {} : { value: branch.value },
				...token.mutable && branch.slot ? { runtime: runtimeMeta(contract, token, branch.address, branch.slot) } : {}
			};
			if (branch.address.kind === "axis") {
				axes[branch.address.axis] ??= {};
				axes[branch.address.axis][branch.address.mode] = branchMeta;
			} else cases.push({
				when: branch.address.when,
				...branchMeta
			});
		}
		const handle = createHandle({
			name: token.name,
			path: token.token.join("."),
			reference: token.reference,
			emit: token.emit,
			mutable: token.mutable,
			type: token.type,
			...token.value === void 0 ? {} : { value: token.value },
			...token.description === void 0 ? {} : { description: token.description },
			...token.deprecated === void 0 ? {} : { deprecated: token.deprecated },
			...token.metadata === void 0 ? {} : { metadata: token.metadata },
			...token.validation === void 0 ? {} : { validate: token.validation },
			...token.mutable && token.baseSlot ? { runtime: runtimeMeta(contract, token, { kind: "base" }, token.baseSlot) } : {},
			...Object.keys(axes).length === 0 ? {} : { axes },
			...cases.length === 0 ? {} : { cases }
		});
		decorateMutableHandle(handle, contract, state, schemas, emit);
		for (const modes of Object.values(handle.$axes)) for (const branch of Object.values(modes)) decorateMutableBranch(branch, contract, state, schemas, emit);
		for (const branch of token.branches) if (branch.address.kind === "case") decorateMutableBranch(handle.$case(branch.address.when), contract, state, schemas, emit);
		setPath(tree, token.token, handle);
	}
	return freezeDeep(tree);
}
function decorateMutableHandle(handle, contract, state, schemas, emit) {
	const runtime = runtimeAddressOf(handle);
	if (!runtime) return;
	defineAction(handle, "$set", (input) => emit(prepareOverride(contract, state, schemas, runtime, input)));
	defineAction(handle, "$unset", () => emit(prepareUnset(contract, state, runtime)));
}
function decorateMutableBranch(handle, contract, state, schemas, emit) {
	const runtime = runtimeAddressOf(handle);
	if (!runtime) return;
	defineAction(handle, "$set", (input) => emit(prepareOverride(contract, state, schemas, runtime, input)));
	defineAction(handle, "$unset", () => emit(prepareUnset(contract, state, runtime)));
}
function prepareOverride(contract, state, schemas, runtime, input) {
	assertActive(state);
	const token = tokenByPath(contract, runtime.token);
	if (!token || !token.mutable) throw new TypeError(`[vanity] ${runtime.token.join(".")} is not a mutable token in this runtime`);
	if (!getTokenSlot(token, runtime.address)) throw new TypeError(`[vanity] ${formatAddress(runtime.token, runtime.address)} is not an authored runtime address`);
	const value = validateAndSerialize(token, input, schemas, state.options);
	if (value === void 0) return {
		kind: "unset",
		token,
		runtime
	};
	return {
		kind: "set",
		token,
		runtime,
		value,
		override: {
			token: token.token,
			address: runtime.address,
			val: value
		}
	};
}
function prepareUnset(contract, state, runtime) {
	assertActive(state);
	const token = tokenByPath(contract, runtime.token);
	if (!token || !token.mutable || !getTokenSlot(token, runtime.address)) throw new TypeError(`[vanity] ${formatAddress(runtime.token, runtime.address)} is not an authored mutable runtime address`);
	return {
		kind: "unset",
		token,
		runtime
	};
}
function applyMutations(state, mutations) {
	assertActive(state);
	const targets = /* @__PURE__ */ new Map();
	for (const mutation of mutations) if (mutation.kind === "set" || mutation.kind === "unset") {
		const root = runtimeRoot(state, mutation.token.rootPath);
		targets.set(mutation, getTargetsForRoot(state, root, true));
	} else {
		const resolved = getRootsForAxis(state, mutation.axis).flatMap((root) => [...getTargetsForRoot(state, root, false)]);
		targets.set(mutation, resolved);
	}
	for (const mutation of mutations) {
		const resolved = targets.get(mutation);
		if (mutation.kind === "set") {
			writeStyle(resolved[0].style, mutation.runtime.slot, mutation.value);
			state.overrides.set(recordKey(mutation.token.token, mutation.runtime.address), mutation.override);
		} else if (mutation.kind === "unset") {
			removeStyle(resolved[0].style, mutation.runtime.slot);
			state.overrides.delete(recordKey(mutation.token.token, mutation.runtime.address));
		} else {
			if (state.memory) {
				state.modes.set(mutation.axis, mutation.mode);
				continue;
			}
			for (const target of resolved) {
				const definition = state.contract.axes[mutation.axis];
				const control = definition.control && state.options.controls?.[definition.control.id];
				if (control) control.activate(target, mutation.mode);
				else if (mutation.name !== void 0 && mutation.value === null) removeAttribute(target, mutation.name);
				else if (mutation.name !== void 0 && typeof mutation.value === "string") writeAttribute(target, mutation.name, mutation.value);
				else throw new TypeError(`[vanity] runtime axis '${mutation.axis}' needs control '${definition.control?.id}' in runtime({ controls })`);
			}
			state.modes.set(mutation.axis, mutation.mode);
		}
	}
}
function applyStateToRoot(state, root) {
	const snapshot = getRuntimeSnapshot(state.contract, state);
	const props = projectProps(state.contract, snapshot)[root.contract.path];
	const targets = getTargetsForRoot(state, root, Object.keys(props.style).length > 0);
	const [styleTarget] = targets;
	if (styleTarget) for (const [name, value] of Object.entries(props.style)) writeStyle(styleTarget.style, name, value);
	for (const [axis, mode] of Object.entries(snapshot.modes)) {
		if (!root.contract.axes.includes(axis)) continue;
		const definition = state.contract.axes[axis];
		const control = definition.control && state.options.controls?.[definition.control.id];
		const value = definition.attribute?.values[mode];
		for (const target of targets) if (control) control.activate(target, mode);
		else if (definition.attribute && value === null) removeAttribute(target, definition.attribute.name);
		else if (definition.attribute && typeof value === "string") writeAttribute(target, definition.attribute.name, value);
	}
}
function reconcileSnapshot(contract, input, schemas, options) {
	const source = parseSnapshot(input);
	const diagnostics = [];
	if (source.system !== contract.system) diagnostics.push({
		code: "VANITY_RUNTIME_SCHEMA_MISMATCH",
		message: `snapshot '${source.system}' differs from current runtime '${contract.system}'; reconciling semantic addresses`
	});
	const overrides = /* @__PURE__ */ new Map();
	for (const entry of source.overrides) {
		if (!isSnapshotOverride(entry)) {
			diagnostics.push({
				code: "VANITY_RUNTIME_UNKNOWN_ADDRESS",
				message: "skipped a malformed runtime override record"
			});
			continue;
		}
		const token = tokenByPath(contract, entry.token);
		if (!token) {
			diagnostics.push({
				code: "VANITY_RUNTIME_UNKNOWN_TOKEN",
				message: `snapshot token '${entry.token.join(".")}' no longer exists`,
				token: entry.token,
				address: entry.address
			});
			continue;
		}
		if (!token.mutable) {
			diagnostics.push({
				code: "VANITY_RUNTIME_IMMUTABLE_TOKEN",
				message: `snapshot token '${entry.token.join(".")}' is no longer mutable`,
				token: entry.token,
				address: entry.address
			});
			continue;
		}
		if (!getTokenSlot(token, entry.address)) {
			diagnostics.push({
				code: "VANITY_RUNTIME_UNKNOWN_ADDRESS",
				message: `snapshot address '${formatAddress(entry.token, entry.address)}' is no longer authored`,
				token: entry.token,
				address: entry.address
			});
			continue;
		}
		let val;
		try {
			val = validateAndSerialize(token, parseSnapshotInput(token.type, entry.val), schemas, {
				...options,
				dev: options.dev ?? false
			});
		} catch (error) {
			diagnostics.push({
				code: "VANITY_RUNTIME_INVALID_VALUE",
				message: `${formatAddress(entry.token, entry.address)} was skipped: ${getErrorMessage(error)}`,
				token: entry.token,
				address: entry.address
			});
			continue;
		}
		if (val === void 0) {
			diagnostics.push({
				code: "VANITY_RUNTIME_INVALID_VALUE",
				message: `${formatAddress(entry.token, entry.address)} was omitted by its validation policy`,
				token: entry.token,
				address: entry.address
			});
			continue;
		}
		const normalized = {
			token: token.token,
			address: normalizeAddress(entry.address, contract.axisOrder),
			val
		};
		overrides.set(recordKey(normalized.token, normalized.address), normalized);
	}
	const modes = {};
	for (const [axis, mode] of Object.entries(source.modes)) {
		const definition = contract.axes[axis];
		if (!definition || !definition.modes.includes(mode)) {
			diagnostics.push({
				code: "VANITY_RUNTIME_UNKNOWN_MODE",
				message: `snapshot mode '${axis}.${mode}' no longer exists`,
				axis,
				mode
			});
			continue;
		}
		if ((!definition.attribute || definition.attribute.values[mode] === void 0) && !definition.control) {
			diagnostics.push({
				code: "VANITY_RUNTIME_UNSELECTABLE_AXIS",
				message: `snapshot mode '${axis}.${mode}' has no runtime root attribute mapping`,
				axis,
				mode
			});
			continue;
		}
		modes[axis] = mode;
	}
	return Object.freeze({
		snapshot: Object.freeze({
			version: 1,
			system: contract.system,
			overrides: Object.freeze(sortOverrides([...overrides.values()], contract.axisOrder)),
			modes: Object.freeze(sortRecord(modes, contract.axisOrder))
		}),
		diagnostics: Object.freeze(diagnostics)
	});
}
function parseSnapshot(input) {
	if (!isPlainObject(input) || input.version !== 1) throw new TypeError(`[vanity] unsupported runtime snapshot protocol '${isPlainObject(input) ? String(input.version) : "unreadable"}'; expected version 1`);
	if (typeof input.system !== "string" || !Array.isArray(input.overrides) || !isPlainObject(input.modes)) throw new TypeError("[vanity] runtime snapshot v1 is unreadable: expected system, overrides, and modes fields");
	for (const mode of Object.values(input.modes)) if (typeof mode !== "string") throw new TypeError("[vanity] runtime snapshot v1 modes must be strings");
	return input;
}
function isSnapshotOverride(input) {
	return isPlainObject(input) && Array.isArray(input.token) && input.token.length > 0 && input.token.every((part) => typeof part === "string" && part.length > 0) && isSemanticAddress(input.address) && typeof input.val === "string" && input.val.trim().length > 0;
}
function isSemanticAddress(input) {
	if (!isPlainObject(input)) return false;
	if (input.kind === "base") return true;
	if (input.kind === "axis") return typeof input.axis === "string" && typeof input.mode === "string";
	if (input.kind === "case") return isPlainObject(input.when) && Object.values(input.when).every((value) => typeof value === "string");
	return false;
}
function validateAndSerialize(token, input, schemas, options) {
	assertUniversalInput(token.type, input);
	const policy = token.validation;
	let output = input;
	if (policy && shouldValidate(policy.runtime, options)) {
		const schema = schemas[policy.id];
		if (!schema) throw new TypeError(`validation schema '${policy.id}' is not registered on this application runtime controller`);
		const result = schema["~standard"].validate(input);
		if (isPromiseLike(result)) throw new TypeError(`validation schema '${policy.id}' is async; runtime setters are synchronous`);
		if ("issues" in result && result.issues !== void 0) {
			if (policy.onInvalid === "omit") return void 0;
			if (policy.onInvalid === "fallback" && policy.fallback !== void 0) output = policy.fallback;
			else throw new TypeError(result.issues.map((issue) => issue.message).join("; ") || `validation schema '${policy.id}' rejected the value`);
		} else output = result.value;
		assertUniversalInput(token.type, output);
	}
	return serializeRuntimeValue(output);
}
function assertUniversalInput(type, input) {
	if (isVanityValue(input) && type !== "unknown" && input.type !== "unknown" && !isCompatibleType(type, input.type)) throw new TypeError(`expected <${type}> but received a <${input.type}> vanity value`);
	if (typeof input === "number") {
		if (!Number.isFinite(input)) throw new TypeError("a runtime CSS number must be finite");
		if (type === "integer" && !Number.isInteger(input)) throw new TypeError(`expected <integer> but received ${input}`);
		if (![
			"unknown",
			"number",
			"integer",
			"percentage",
			"number-percentage"
		].includes(type)) throw new TypeError(`a bare number is not a <${type}> runtime input`);
		return;
	}
	if (typeof input === "string") {
		if (input.trim().length === 0) throw new TypeError("a runtime CSS value cannot be empty");
		return;
	}
	if (!isVanityValue(input) && !isHandle(input) && !isBranchHandle(input)) throw new TypeError("runtime CSS values must be strings, finite numbers, vanity values, or token handles");
}
function parseSnapshotInput(type, val) {
	if ((type === "number" || type === "integer" || type === "number-percentage") && /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[-+]?\d+)?$/i.test(val.trim())) return Number(val);
	return val;
}
function isCompatibleType(expected, actual) {
	return expected === actual || expected === "number-percentage" && (actual === "number" || actual === "integer" || actual === "percentage") || expected === "length-percentage" && (actual === "length" || actual === "percentage") || expected === "number" && actual === "integer";
}
function serializeRuntimeValue(input) {
	if (typeof input === "number") return String(Object.is(input, -0) ? 0 : input);
	if (typeof input === "string") {
		if (input.trim().length === 0) throw new TypeError("[vanity] a runtime CSS value cannot be empty");
		return input;
	}
	if (isCssValue(input)) return input.css;
	if (isHandle(input) || isBranchHandle(input) || isVanityValue(input)) {
		const serialized = String(input);
		if (serialized.trim().length === 0) throw new TypeError("[vanity] a runtime CSS value cannot serialize to an empty string");
		return serialized;
	}
	throw new TypeError("[vanity] cannot serialize this runtime CSS value");
}
function shouldValidate(mode, options) {
	return mode === "always" || mode === "dev" && (options.dev ?? inferDevelopmentMode());
}
function inferDevelopmentMode() {
	return Reflect.get(globalThis, "process")?.env?.NODE_ENV !== "production";
}
function isPromiseLike(value) {
	return (typeof value === "object" || typeof value === "function") && value !== null && "then" in value;
}
function projectStyles(contract, snapshot) {
	const styles = Object.fromEntries(contract.roots.map((root) => [root.path, {}]));
	for (const entry of snapshot.overrides) {
		const token = tokenByPath(contract, entry.token);
		const slot = token && getTokenSlot(token, entry.address);
		if (token && slot) styles[token.rootPath][slot] = entry.val;
	}
	for (const [axis, mode] of Object.entries(snapshot.modes)) {
		const projected = contract.axes[axis]?.control?.projections?.[mode]?.style;
		if (!projected) continue;
		for (const root of contract.roots) if (root.axes.includes(axis)) Object.assign(styles[root.path], projected);
	}
	return Object.freeze(Object.fromEntries(contract.roots.map((root) => [root.path, Object.freeze(styles[root.path])])));
}
function projectAttributesForRoot(contract, snapshot, root) {
	const attributes = {};
	for (const [axis, mode] of Object.entries(snapshot.modes)) {
		if (!root.axes.includes(axis)) continue;
		const adapter = contract.axes[axis]?.attribute;
		const value = adapter?.values[mode];
		if (adapter && value !== void 0 && value !== null) attributes[adapter.name] = value;
		Object.assign(attributes, contract.axes[axis]?.control?.projections?.[mode]?.attributes);
	}
	return Object.freeze(attributes);
}
function projectProps(contract, snapshot) {
	const styles = projectStyles(contract, snapshot);
	return Object.freeze(Object.fromEntries(contract.roots.map((root) => [root.path, Object.freeze({
		style: styles[root.path],
		attributes: projectAttributesForRoot(contract, snapshot, root)
	})])));
}
function restoreRuntimeState(contract, state, snapshot) {
	const props = projectProps(contract, snapshot);
	const targets = /* @__PURE__ */ new Map();
	for (const root of contract.roots) {
		const rootProps = props[root.path];
		const needsUniqueOwner = Object.keys(rootProps.style).length > 0;
		targets.set(root.path, getTargetsForRoot(state, runtimeRoot(state, root.path), needsUniqueOwner));
	}
	for (const previous of state.overrides.values()) {
		const token = tokenByPath(contract, previous.token);
		const slot = token && getTokenSlot(token, previous.address);
		if (token && slot && !snapshot.overrides.some((entry) => recordKey(entry.token, entry.address) === recordKey(previous.token, previous.address))) {
			const [target] = targets.get(token.rootPath) ?? [];
			if (target) removeStyle(target.style, slot);
		}
	}
	for (const entry of snapshot.overrides) {
		const token = tokenByPath(contract, entry.token);
		const slot = getTokenSlot(token, entry.address);
		writeStyle(targets.get(token.rootPath)[0].style, slot, entry.val);
	}
	for (const [axis] of state.modes) {
		if (snapshot.modes[axis] !== void 0) continue;
		const adapter = contract.axes[axis]?.attribute;
		if (!adapter) continue;
		for (const root of getRootsForAxis(state, axis)) for (const target of targets.get(root.contract.path) ?? []) removeAttribute(target, adapter.name);
	}
	for (const [axis, mode] of Object.entries(snapshot.modes)) {
		const definition = contract.axes[axis];
		const adapter = definition.attribute;
		const value = adapter?.values[mode];
		const control = definition.control && state.options.controls?.[definition.control.id];
		if (definition.control && !control) throw new TypeError(`[vanity] runtime axis '${axis}' needs control '${definition.control.id}' in runtime({ controls })`);
		for (const root of getRootsForAxis(state, axis)) for (const target of targets.get(root.contract.path) ?? []) if (control) control.activate(target, mode);
		else if (adapter && value === null) removeAttribute(target, adapter.name);
		else if (adapter && value !== void 0) writeAttribute(target, adapter.name, value);
	}
	state.overrides.clear();
	snapshot.overrides.forEach((entry) => state.overrides.set(recordKey(entry.token, entry.address), entry));
	state.modes.clear();
	Object.entries(snapshot.modes).forEach(([axis, mode]) => state.modes.set(axis, mode));
}
function getRuntimeSnapshot(contract, state) {
	return Object.freeze({
		version: 1,
		system: contract.system,
		overrides: Object.freeze(sortOverrides([...state.overrides.values()], contract.axisOrder)),
		modes: Object.freeze(sortRecord(Object.fromEntries(state.modes), contract.axisOrder))
	});
}
function createEmptySnapshot(contract) {
	return Object.freeze({
		version: 1,
		system: contract.system,
		overrides: Object.freeze([]),
		modes: Object.freeze({})
	});
}
function runtimeMeta(contract, token, address, slot) {
	return freezeDeep({
		system: contract.system,
		token: token.token,
		address,
		slot
	});
}
function getTokenSlot(token, address) {
	if (address.kind === "base") return token.baseSlot;
	return token.branches.find((branch) => isSameTokenAddress(branch.address, address))?.slot;
}
function isSameTokenAddress(left, right) {
	if (left.kind !== right.kind) return false;
	if (left.kind === "base") return true;
	if (left.kind === "axis" && right.kind === "axis") return left.axis === right.axis && left.mode === right.mode;
	return left.kind === "case" && right.kind === "case" && serializeStableString(sortRecord(left.when)) === serializeStableString(sortRecord(right.when));
}
var tokenIndexes = /* @__PURE__ */ new WeakMap();
function tokenByPath(contract, token) {
	let index = tokenIndexes.get(contract);
	if (index === void 0) {
		index = new Map(contract.tokens.map((entry) => [entry.token.join("."), entry]));
		tokenIndexes.set(contract, index);
	}
	return index.get(token.join("."));
}
function recordKey(token, address) {
	return `${token.join(".")}\0${addressKey(address)}`;
}
function addressKey(address, axisOrder = []) {
	if (address.kind === "base") return "0:base";
	if (address.kind === "axis") return `1:axis:${address.axis}:${address.mode}`;
	return `2:case:${Object.entries(sortRecord(address.when, axisOrder)).map(([axis, mode]) => `${axis}:${mode}`).join("|")}`;
}
function normalizeAddress(address, axisOrder) {
	return address.kind === "case" ? {
		kind: "case",
		when: Object.freeze(sortRecord(address.when, axisOrder))
	} : address;
}
function sortOverrides(entries, axisOrder) {
	return entries.sort((left, right) => {
		return left.token.join(".").localeCompare(right.token.join(".")) || addressKey(left.address, axisOrder).localeCompare(addressKey(right.address, axisOrder));
	});
}
function sortRecord(record, preferred = []) {
	const rank = new Map(preferred.map((key, index) => [key, index]));
	return Object.fromEntries(Object.entries(record).sort(([left], [right]) => {
		return (rank.get(left) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right) ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right);
	}));
}
function formatAddress(token, address) {
	if (address.kind === "base") return token.join(".");
	if (address.kind === "axis") return `${token.join(".")}.$axes.${address.axis}.${address.mode}`;
	return `${token.join(".")}.$case(${JSON.stringify(address.when)})`;
}
function getResolutionScope(options) {
	if (options.within !== void 0) {
		if (typeof options.within !== "object" && typeof options.within !== "function" || options.within === null) throw new TypeError("[vanity] runtime({ within }) needs a document, shadow root, element, or query adapter");
		return options.within;
	}
	return globalThis.document;
}
function runtimeRoot(state, path) {
	const root = state.roots.get(path);
	if (!root) throw new TypeError(`[vanity] runtime has no root '${path}'; expected '$system' or one of: ${[...state.roots.keys()].filter((key) => key !== "$system").join(", ") || "(none)"}`);
	return root;
}
function getRootsForAxis(state, axis) {
	return [...state.roots.values()].filter((root) => root.contract.axes.includes(axis));
}
function getTargetsForRoot(state, root, unique) {
	resolveRuntimeRoot(state, root);
	if (!unique) return root.targets;
	if (root.targets.length === 1) return root.targets;
	const diagnostic = root.targets.length === 0 ? {
		code: "VANITY_RUNTIME_ROOT_NOT_FOUND",
		message: `runtime root '${root.contract.path}' (${root.contract.selector}) was not found; mount it and call refreshRoots('${root.contract.path}') or bindRoot('${root.contract.path}', element)`,
		rootPath: root.contract.path
	} : {
		code: "VANITY_RUNTIME_AMBIGUOUS_ROOT",
		message: `runtime root '${root.contract.path}' (${root.contract.selector}) matched ${root.targets.length} elements; use runtime({ within }) or bindRoot('${root.contract.path}', element)`,
		rootPath: root.contract.path
	};
	appendRuntimeDiagnostic(state, diagnostic);
	throw new TypeError(`[vanity] ${diagnostic.message}`);
}
function resolveRuntimeRoot(state, root, force = false) {
	if (root.bound || root.resolved && !force) return;
	if (state.memory) return;
	const scope = state.within ?? getResolutionScope(state.options);
	if (!scope) {
		root.targets = [];
		root.resolved = true;
		return;
	}
	const matches = [];
	const candidate = scope;
	if (typeof candidate.matches === "function" && candidate.matches(root.contract.selector)) matches.push(candidate);
	if (root.contract.selector === ":root" && candidate.documentElement !== void 0 && isRuntimeTarget(candidate.documentElement)) matches.push(candidate.documentElement);
	if (typeof candidate.querySelectorAll === "function") {
		const queried = candidate.querySelectorAll(root.contract.selector);
		for (const value of Array.from(queried)) if (isRuntimeTarget(value) && !matches.includes(value)) matches.push(value);
	} else if (typeof candidate.querySelector === "function") {
		const value = candidate.querySelector(root.contract.selector);
		if (isRuntimeTarget(value) && !matches.includes(value)) matches.push(value);
	}
	root.targets = matches;
	root.resolved = true;
}
function assertRuntimeTarget(value) {
	if (!isRuntimeTarget(value)) throw new TypeError("[vanity] bindRoot() needs one concrete HTML/SVG inline-style target; selector strings are not accepted");
}
function isRuntimeTarget(value) {
	return (typeof value === "object" || typeof value === "function") && value !== null && isStyleDeclaration(value.style) && typeof value.setAttribute === "function" && typeof value.removeAttribute === "function";
}
function appendRuntimeDiagnostic(state, diagnostic) {
	if (!state.diagnostics.some((current) => current.code === diagnostic.code && current.message === diagnostic.message)) state.diagnostics.push(Object.freeze(diagnostic));
}
function writeStyle(style, name, value) {
	if (style.getPropertyValue?.(name) !== value) style.setProperty(name, value);
}
function removeStyle(style, name) {
	if (!style.getPropertyValue || style.getPropertyValue(name) !== "") style.removeProperty(name);
}
function writeAttribute(target, name, value) {
	if (target.getAttribute?.(name) !== value) target.setAttribute(name, value);
}
function removeAttribute(target, name) {
	if (!target.getAttribute || target.getAttribute(name) !== null) target.removeAttribute(name);
}
function assertActive(state) {
	if (!state.active) throw new TypeError("[vanity] this runtime binding was superseded on the same root; use the current ds.runtime() instance after HMR/rebind");
}
function isStyleDeclaration(value) {
	return (typeof value === "object" || typeof value === "function") && value !== null && typeof value.setProperty === "function" && typeof value.removeProperty === "function";
}
function mergeSchemas(embedded, supplied) {
	return supplied === void 0 ? embedded : {
		...embedded,
		...supplied
	};
}
function setPath(tree, path, value) {
	let target = tree;
	for (let index = 0; index < path.length; index++) {
		const key = path[index];
		if (index === path.length - 1) target[key] = value;
		else {
			if (!isPlainObject(target[key])) target[key] = {};
			target = target[key];
		}
	}
}
function defineAction(target, name, value) {
	Object.defineProperty(target, name, {
		enumerable: true,
		configurable: true,
		value
	});
}
function isPlainObject(value) {
	if (typeof value !== "object" || value === null) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}
function serializeStableString(value) {
	if (Array.isArray(value)) return `[${value.map(serializeStableString).join(",")}]`;
	if (isPlainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${serializeStableString(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function freezeDeep(value) {
	if ((Array.isArray(value) || isPlainObject(value)) && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value)) freezeDeep(child);
	}
	return value;
}
function getErrorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
function restoreToken(meta) {
	return createHandle(meta);
}
function restoreStyleAuthoringStub(meta) {
	return () => {
		const remedy = meta.name === "class" ? "Use the generated class export in application modules." : meta.name === "rules" ? "Import the style module for its emitted CSS in application modules." : meta.name === "introspect" ? "Use ds.introspect() in a system module, or consume the generated manifest." : "Use ds.runtime() in application modules, or consume serialized style exports.";
		const location = meta.name === "introspect" ? "introspect belongs in a system module." : `${meta.name} belongs in a *.css.ts style module.`;
		throw new Error(`[vanity] VANITY_STYLE_MODULE_MISUSE: ${location} ${remedy}`);
	};
}
//#endregion
//#region \0vanity:system-runtime:ssr:vanity-compatibility-1-1ih7bmt:vanity-runtime-schema-1-yf3nmp
var _runtimeContract = {
	"axes": { "scheme": {
		"attribute": {
			"name": "data-scheme",
			"values": {
				"dark": "dark",
				"light": "light"
			}
		},
		"defaultMode": "light",
		"modes": ["light", "dark"]
	} },
	"axisOrder": ["scheme"],
	"prefix": "canary",
	"protocol": 2,
	"root": ":root",
	"roots": [{
		"axes": ["scheme"],
		"path": "$system",
		"selector": ":root"
	}, {
		"axes": ["scheme"],
		"path": "panel",
		"selector": "#panel"
	}],
	"system": "vanity-runtime-2-1jdvz9j",
	"tokens": [
		{
			"token": ["color", "brand"],
			"name": "--canary-color-brand",
			"rootPath": "$system",
			"root": ":root",
			"type": "color",
			"reference": "var",
			"emit": true,
			"mutable": true,
			"baseSlot": "--canary-v-6jb35s",
			"branches": [{
				"address": {
					"axis": "scheme",
					"kind": "axis",
					"mode": "dark"
				},
				"slot": "--canary-v-jueavt"
			}, {
				"address": {
					"axis": "scheme",
					"kind": "axis",
					"mode": "light"
				},
				"slot": "--canary-v-1uiq57f"
			}]
		},
		{
			"token": ["color", "canvas"],
			"name": "--canary-color-canvas",
			"rootPath": "$system",
			"root": ":root",
			"type": "unknown",
			"reference": "var",
			"emit": true,
			"mutable": false,
			"branches": []
		},
		{
			"token": ["space", "md"],
			"name": "--canary-space-md",
			"rootPath": "$system",
			"root": ":root",
			"type": "unknown",
			"reference": "var",
			"emit": true,
			"mutable": false,
			"branches": []
		},
		{
			"token": ["panel", "accent"],
			"name": "--canary-panel-accent",
			"rootPath": "panel",
			"root": "#panel",
			"type": "color",
			"reference": "var",
			"emit": true,
			"mutable": false,
			"branches": [{ "address": {
				"axis": "scheme",
				"kind": "axis",
				"mode": "dark"
			} }, { "address": {
				"axis": "scheme",
				"kind": "axis",
				"mode": "light"
			} }]
		}
	]
};
var _tokenRecords = [
	{
		"name": "--canary-color-brand",
		"path": "color.brand",
		"reference": "var",
		"emit": true,
		"mutable": true,
		"type": "color",
		"runtime": {
			"address": { "kind": "base" },
			"slot": "--canary-v-6jb35s",
			"system": "vanity-runtime-2-1jdvz9j",
			"token": ["color", "brand"]
		},
		"axes": { "scheme": {
			"dark": { "runtime": {
				"address": {
					"axis": "scheme",
					"kind": "axis",
					"mode": "dark"
				},
				"slot": "--canary-v-jueavt",
				"system": "vanity-runtime-2-1jdvz9j",
				"token": ["color", "brand"]
			} },
			"light": { "runtime": {
				"address": {
					"axis": "scheme",
					"kind": "axis",
					"mode": "light"
				},
				"slot": "--canary-v-1uiq57f",
				"system": "vanity-runtime-2-1jdvz9j",
				"token": ["color", "brand"]
			} }
		} }
	},
	{
		"name": "--canary-color-canvas",
		"path": "color.canvas",
		"reference": "var",
		"emit": true,
		"mutable": false,
		"type": "unknown"
	},
	{
		"name": "--canary-space-md",
		"path": "space.md",
		"reference": "var",
		"emit": true,
		"mutable": false,
		"type": "unknown"
	},
	{
		"name": "--canary-panel-accent",
		"path": "panel.accent",
		"reference": "var",
		"emit": true,
		"mutable": false,
		"type": "color",
		"axes": { "scheme": {
			"dark": {},
			"light": {}
		} }
	}
];
var _t = {};
for (const _meta of _tokenRecords) {
	const _parts = _meta.path.split(".");
	let _target = _t;
	for (let _index = 0; _index < _parts.length - 1; _index++) _target = _target[_parts[_index]] ||= {};
	_target[_parts.at(-1)] = restoreToken(_meta);
}
var _runtime = restoreRuntimeControllerFactory(_runtimeContract);
var _snapshotFrom = restoreSnapshotFrom(_runtimeContract);
var _reconcileRuntimeSnapshot = restoreRuntimeReconciler(_runtimeContract);
var _runtimeStyle = restoreRuntimeStyle(_runtimeContract);
var _runtimeProps = restoreRuntimeProps(_runtimeContract);
var ds = Object.freeze({
	t: Object.freeze(_t),
	runtime: _runtime,
	snapshotFrom: _snapshotFrom,
	reconcileRuntimeSnapshot: _reconcileRuntimeSnapshot,
	runtimeStyle: _runtimeStyle,
	runtimeProps: _runtimeProps,
	conditions: Object.freeze({
		"active": "&:active",
		"conditionMatrix": "@media (1px <= width) @supports (display: grid) @container canary (1px <= inline-size) &[data-ready]",
		"dark": "&:where([data-scheme='dark'], [data-scheme='dark'] *) | @media (prefers-color-scheme: dark) &:where(:not([data-scheme='light'], [data-scheme='light'] *))",
		"disabled": "&:disabled",
		"focusVisible": "&:focus-visible",
		"hover": "&:hover",
		"hoverFocus": "&:hover, &:focus-visible",
		"light": "&:where([data-scheme='light'], [data-scheme='light'] *) | @media (prefers-color-scheme: light) &:where(:not([data-scheme='dark'], [data-scheme='dark'] *))",
		"ltr": "&:dir(ltr)",
		"motionOk": "@media (prefers-reduced-motion: no-preference)",
		"motionReduce": "@media (prefers-reduced-motion: reduce)",
		"rtl": "&:dir(rtl)"
	}),
	layers: Object.freeze([
		"reset",
		"tokens",
		"recipes",
		"utilities",
		"overrides"
	]),
	consts: Object.freeze({ "product": "reorientation-canary" }),
	environment: "ssr",
	class: restoreStyleAuthoringStub({ name: "class" }),
	rules: restoreStyleAuthoringStub({ name: "rules" }),
	raw: restoreStyleAuthoringStub({ name: "raw" }),
	fragment: restoreStyleAuthoringStub({ name: "fragment" }),
	tdec: restoreStyleAuthoringStub({ name: "tdec" }),
	keyframes: restoreStyleAuthoringStub({ name: "keyframes" }),
	fontFace: restoreStyleAuthoringStub({ name: "fontFace" }),
	recipe: restoreStyleAuthoringStub({ name: "recipe" }),
	anatomy: restoreStyleAuthoringStub({ name: "anatomy" }),
	port: restoreStyleAuthoringStub({ name: "port" }),
	atoms: restoreStyleAuthoringStub({ name: "atoms" }),
	inLayer: restoreStyleAuthoringStub({ name: "inLayer" }),
	tokensOf: restoreStyleAuthoringStub({ name: "tokensOf" }),
	namesOf: restoreStyleAuthoringStub({ name: "namesOf" }),
	varsOf: restoreStyleAuthoringStub({ name: "varsOf" }),
	explain: restoreStyleAuthoringStub({ name: "explain" }),
	serialize: restoreStyleAuthoringStub({ name: "serialize" }),
	introspect: restoreStyleAuthoringStub({ name: "introspect" })
});
//#endregion
//#region src/entry-server.ts
function renderCanarySeed() {
	const snapshot = ds.snapshotFrom((runtime) => {
		runtime.t.color.brand.$set("#16a34a");
		runtime.axes.scheme.$switchTo("dark");
	});
	return {
		snapshot,
		props: ds.runtimeProps(snapshot)
	};
}
//#endregion
export { renderCanarySeed };
