import { readFileSync, writeFileSync } from 'node:fs'
// Run: pnpm --filter spike-property-grammar-agreement generate
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import webref from '@webref/css'
import { definitionSyntax } from 'css-tree'
import { all } from 'known-css-properties'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const data = await webref.listAll()
const root = fileURLToPath(new URL('.', import.meta.url))
const fixture = `${root}property-types.ts`
const program = ts.createProgram([fixture], { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, skipLibCheck: true })
const checker = program.getTypeChecker()
const declaration = program.getSourceFile(fixture).statements.find(ts.isTypeAliasDeclaration)
const names = checker.getPropertiesOfType(checker.getTypeAtLocation(declaration)).map(x => x.name)
const properties = Object.fromEntries(data.properties.map(feature => [feature.name, {
  syntax: feature.syntax ?? null,
  longhands: feature.longhands ?? [],
  logicalPropertyGroup: feature.logicalPropertyGroup ?? null,
  styleDeclaration: feature.styleDeclaration,
  href: feature.href,
}]))
const types = [...data.types, ...data.functions].filter(x => x.syntax).map(x => ({ name: x.name, syntax: x.syntax, for: x.for ?? [] }))
// The AST retains ranges and component grammar, rather than a hand-maintained
// table of numeric restrictions or a union that loses shorthand positions.
const grammars = Object.fromEntries(Object.entries(properties).filter(([,x]) => x.syntax).map(([key, x]) => [key, definitionSyntax.parse(x.syntax)]))
const propertyNames = [...new Set([...all, ...names.map(name => name.replace(/[A-Z]/g, x => `-${x.toLowerCase()}`).replace(/^ms-/, '-ms-'))])].sort()
const output = { source: { package: '@webref/css', version: JSON.parse(readFileSync(require.resolve('@webref/css/package.json'))).version }, properties, types, grammars, selectors: data.selectors.map(x => x.name), propertyNames, cssTypeNames: names }
const serialized = `${JSON.stringify(output, null, 2)}\n`
const outputPath = new URL('./grammar.generated.json', import.meta.url)
if (process.argv.includes('--check')) {
  if (readFileSync(outputPath, 'utf8') !== serialized)
    throw new Error('Generated grammar data drift; run generate')
}
else {
  writeFileSync(outputPath, serialized)
}
console.log(JSON.stringify({ source: output.source, reachableProperties: propertyNames.length, grammarProperties: Object.keys(properties).length, types: types.length, selectors: output.selectors.length }))
