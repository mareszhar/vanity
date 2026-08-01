type Merge<Left extends object, Right extends object> = Left & Right
type DuplicateGuard<Current extends object, Added extends object> = {
  readonly [Key in keyof Added]: Key extends keyof Current ? never : Added[Key]
}
type ModuleShape<Module> = Module extends Builder<infer Shape> ? Shape : never
type ModuleListShape<
  Modules extends readonly Builder<any>[],
  Result extends object = Record<never, never>,
> = Modules extends readonly [infer Head extends Builder<any>, ...infer Tail extends readonly Builder<any>[]]
  ? ModuleListShape<Tail, Merge<Result, ModuleShape<Head>>>
  : Result

export interface Builder<Shape extends object = Record<never, never>> {
  readonly shape: Shape
  add: {
    <const Name extends string, const Value>(
      name: Name extends keyof Shape ? never : Name,
      value: Value,
    ): Builder<Merge<Shape, Record<Name, Value>>>
    <const Name extends string, const Value>(
      name: Name extends keyof Shape ? never : Name,
      value: (module: Readonly<Shape>) => Value,
    ): Builder<Merge<Shape, Record<Name, Value>>>
    <const Module extends Builder<any>>(module: Module): Builder<Merge<Shape, ModuleShape<Module>>>
    <const Modules extends readonly Builder<any>[]>(modules: Modules): Builder<Merge<Shape, ModuleListShape<Modules>>>
    <const Added extends object>(value: (module: Readonly<Shape>) => Added): Builder<Merge<Shape, Added>>
    <const Added extends object>(value: Added & DuplicateGuard<Shape, Added>): Builder<Merge<Shape, Added>>
  }
}

export interface System<Shape extends object = Record<never, never>> {
  readonly shape: Readonly<Shape>
  add: {
    <const Module extends Builder<any>>(module: Module): System<Merge<Shape, ModuleShape<Module>>>
    <const Modules extends readonly Builder<any>[]>(modules: Modules): System<Merge<Shape, ModuleListShape<Modules>>>
    <const Added extends object>(value: (system: System<Shape>) => Added): System<Merge<Shape, Added>>
    <const Added extends object>(value: Added & DuplicateGuard<Shape, Added>): System<Merge<Shape, Added>>
  }
}

export function define(): Builder {
  return null as unknown as Builder
}

export function system(): System {
  return null as unknown as System
}
