export function getSupportedViteMajors(workspace: string): number[] {
  const catalogs = workspace.match(/^catalogs:[ \t]*\r?\n((?:[ \t][^\r\n]*\r?\n|\r?\n)*)/m)?.[1]
  const peers = catalogs?.match(/^ {2}peers:[ \t]*\r?\n((?: {4}[^\r\n]*\r?\n|\r?\n)*)/m)?.[1]
  const line = peers?.match(/^\s{4}vite:\s*(?:'([^']+)'|"([^"]+)"|([^\r\n#]+))/m)
  const range = line?.[1] ?? line?.[2] ?? line?.[3]?.trim()
  if (range === undefined)
    throw new Error('Could not read vite from the peers catalog in pnpm-workspace.yaml')

  const majors = [...new Set([...range.matchAll(/(?:^|\|\|)\s*\^(\d+)\.\d+\.\d+/g)]
    .map(match => Number(match[1])))].sort((left, right) => left - right)
  if (majors.length === 0) {
    throw new Error(
      `Could not derive supported Vite majors from the peers range '${range}'; update this parser for the new range form`,
    )
  }
  return majors
}
