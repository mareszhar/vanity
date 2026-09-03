export function selectAutoImportNames(
  names: readonly string[],
  options: {
    include?: readonly string[]
    exclude?: readonly string[]
  },
  owner: string,
): string[] {
  if (options.include !== undefined && options.exclude !== undefined) {
    throw new TypeError(`${owner} cannot use both include and exclude`)
  }

  if (options.include !== undefined)
    return names.filter(name => options.include!.includes(name))

  if (options.exclude !== undefined)
    return names.filter(name => !options.exclude!.includes(name))

  return [...names]
}
