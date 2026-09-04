import { VanityError } from '../../diagnostics'

export function selectAutoImportNames(
  names: readonly string[],
  options: {
    include?: readonly string[]
    exclude?: readonly string[]
  },
  owner: string,
): string[] {
  if (options.include !== undefined && options.exclude !== undefined) {
    throw new VanityError({
      code: 'VANITY_AUTO_IMPORT_INVALID',
      message: `${owner} cannot use both include and exclude`,
      path: ['autoImports'],
      fix: 'choose either include or exclude for an auto-import source',
    })
  }

  if (options.include !== undefined)
    return names.filter(name => options.include!.includes(name))

  if (options.exclude !== undefined)
    return names.filter(name => !options.exclude!.includes(name))

  return [...names]
}
