/**
 * Prepare and grade agent-skill evaluation runs. The shipped skills in
 * `sdk/skills/` are Vanity's adopter documentation for agents; this script
 * gives each task in `sandbox/skill-evals/evals.json` a fresh copy of the
 * fixture Nuxt app, then grades what an agent produced there: the project
 * must typecheck and build, must not hardcode design values or hand-build
 * custom properties, and must satisfy the task's own assertions.
 *
 *   pnpm run skills:eval prepare <run-dir> <model>   materialize the skills snapshot, projects, and prompts
 *   pnpm run skills:eval grade <run-dir>     grade every prepared project and write grading.json
 *   pnpm run skills:verify                   compile every mapped skill code block (no agents involved)
 *
 * `verify` is the deterministic half: it copies each code block named in
 * `sandbox/skill-evals/snippets.ts` verbatim into a fixture copy, typechecks and
 * builds it, executes the system examples, runs the test examples with Vitest, and
 * reports blocks it could not cover.
 */

import type { VanitySkillSnippet } from '../sandbox/skill-evals/snippets.ts'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { skillSnippets, skippedSkillSnippets } from '../sandbox/skill-evals/snippets.ts'

interface Assertion {
  readonly text: string
  readonly glob: string
  readonly pattern: string
  readonly expect: 'present' | 'absent'
}

interface Eval {
  readonly id: number
  readonly name: string
  readonly prompt: string
  readonly assertions: readonly Assertion[]
}

interface Expectation {
  readonly text: string
  readonly passed: boolean
  readonly evidence: string
}

const workspaceDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const evalsDir = join(workspaceDir, 'sandbox/skill-evals')
const fixtureDir = join(evalsDir, 'fixture')
const skillsDir = join(workspaceDir, 'sdk/skills')
// The flagship demo already installs exactly the Nuxt + Vue + Pug toolchain the fixture needs.
const dependencyDir = join(workspaceDir, 'sandbox/demo-main/node_modules')
// The SDK's own test runner runs the skills' test examples.
const vitestDir = join(workspaceDir, 'sdk/node_modules/vitest')
const evals = (JSON.parse(readFileSync(join(evalsDir, 'evals.json'), 'utf8')) as { evals: Eval[] }).evals

const [command, runArg, modelArg] = process.argv.slice(2)
const isRunCommand = (command === 'prepare' && modelArg !== undefined) || (command === 'grade' && runArg !== undefined)
if (!(command === 'verify' || isRunCommand)) {
  console.error('usage: skill-evals prepare <run-dir> <model> | skill-evals grade <run-dir> | skill-evals verify')
  process.exit(1)
}
const runDir = resolve(runArg ?? '.')

function runNuxt(project: string, args: readonly string[]): { ok: boolean, output: string } {
  try {
    const output = execFileSync('npx', ['--no-install', ...args], { cwd: project, encoding: 'utf8', stdio: 'pipe' })
    return { ok: true, output }
  }
  catch (error) {
    const failure = error as { stdout?: string, stderr?: string }
    return { ok: false, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` }
  }
}

function writePrompt(name: string, project: string, task: string): void {
  const prompt = `You are a frontend engineer working in a Nuxt 4 + Vue + Pug project at \`${project}\`. The project styles everything with a library called Vanity. You have no prior knowledge of Vanity: everything you know about it must come from the agent skills in \`${join(runDir, 'skills')}\` (each subfolder has a SKILL.md whose frontmatter description says when to use it; read the descriptions, load the skill(s) relevant to your task, and follow their pointers to reference files only as needed).

Rules:
- Only read files inside the project directory (skip node_modules, .nuxt, .output) and the skills directory. Do not open anything else on disk, do not browse the web, and do not read Vanity's source or type declarations in node_modules.
- Commands you may run from the project directory: \`npx --no-install nuxi prepare\`, \`npx --no-install nuxi typecheck\`, \`npx --no-install nuxt build\`. Do not install packages.
- Work as you would for a real teammate. Finish with typecheck and build passing.

Task from the designer:
"${task}"

When done, write \`REPORT.md\` in the project root with: (1) a summary of what you built; (2) the exact list of skill files you read, in order; (3) anything in the skills that was unclear, missing, wrong, or that you had to guess; (4) any design values you hardcoded instead of using tokens, and why. Reply with a two-line summary.
`
  writeFileSync(join(runDir, name, 'prompt.md'), prompt)
}

/** Link the shared toolchain into a fixture copy without sharing its build cache. */
function linkDependencies(project: string): void {
  mkdirSync(join(project, 'node_modules'))
  for (const entry of readdirSync(dependencyDir)) {
    if (entry !== '.cache')
      symlinkSync(join(dependencyDir, entry), join(project, 'node_modules', entry))
  }
}

function prepare(): void {
  if (existsSync(runDir))
    throw new Error(`${runDir} already exists; choose a new run directory`)
  mkdirSync(runDir, { recursive: true })
  cpSync(skillsDir, join(runDir, 'skills'), { recursive: true })
  // Provenance: results only mean something next to the exact skills and model that produced them.
  const digest = createHash('sha256')
  for (const file of listFiles(skillsDir).sort())
    digest.update(file).update(readFileSync(join(skillsDir, file)))
  writeFileSync(join(runDir, 'run.json'), `${JSON.stringify({ model: modelArg, skills: digest.digest('hex'), createdAt: new Date().toISOString() }, null, 2)}\n`)

  for (const task of evals) {
    const project = join(runDir, task.name, 'project')
    cpSync(fixtureDir, project, { recursive: true })
    linkDependencies(project)
    const prepared = runNuxt(project, ['nuxi', 'prepare'])
    if (!prepared.ok)
      throw new Error(`nuxi prepare failed for ${task.name}:\n${prepared.output}`)
    writePrompt(task.name, project, task.prompt)
    console.log(`✓ ${task.name}`)
  }
  console.log(`\nPrepared ${evals.length} projects. Give each agent its ${relative(workspaceDir, runDir)}/<eval>/prompt.md, then run grade.`)
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(directory, join(entry.parentPath, entry.name)))
    .filter(file => !/(?:^|\/)(?:node_modules|\.nuxt|\.output|\.vanity)\//.test(file))
}

function matchesGlob(file: string, glob: string): boolean {
  const source = glob
    .replace(/[.+^$()|[\]\\]/g, '\\$&')
    .replace(/\{([^}]+)\}/g, (_, options: string) => `(?:${options.split(',').join('|')})`)
    .replace(/\*\*\//g, '\0DIRS\0')
    .replace(/\*\*/g, '\0ANY\0')
    .replace(/\*/g, '[^/]*')
    .replaceAll('\0DIRS\0', '(?:.*/)?')
    .replaceAll('\0ANY\0', '.*')
  return new RegExp(`^${source}$`).test(file)
}

/** Lines in style modules that hardcode a color or a dimension/duration string. */
function findRawDesignValues(project: string, files: readonly string[]): string[] {
  const color = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/i
  const dimension = /['"`][^'"`]*?(?<![\w.-])(?:\d*\.)?\d+(?:px|rem|em|ms|s)\b/
  // The visually-hidden recipe's 1px box is mechanics, not a design decision.
  const mechanics = /\b(?:inlineSize|blockSize|width|height|margin)\s*:\s*['"]-?1px['"]/
  return files
    .filter(file => file.endsWith('.css.ts'))
    .flatMap(file => readFileSync(join(project, file), 'utf8').split('\n').map((line, index) => ({ file, line, index })))
    .filter(({ line }) => !line.trim().startsWith('//') && !mechanics.test(line) && (color.test(line) || dimension.test(line)))
    .map(({ file, line, index }) => `${file}:${index + 1}: ${line.trim()}`)
}

/** Application code that addresses Vanity's custom properties or styles by hand. */
function findHandBuiltStyles(project: string, files: readonly string[]): string[] {
  return files
    .filter(file => (file.endsWith('.vue') || file.endsWith('.ts')) && !file.endsWith('.css.ts') && file.startsWith('app/'))
    .flatMap(file => readFileSync(join(project, file), 'utf8').split('\n').map((line, index) => ({ file, line, index })))
    .filter(({ line }) => /var\(--|['"`]--[a-z]|:style="\{/.test(line))
    .map(({ file, line, index }) => `${file}:${index + 1}: ${line.trim()}`)
}

function grade(): void {
  const rows: string[] = []
  for (const task of evals) {
    const runTaskDir = join(runDir, task.name)
    const project = join(runTaskDir, 'project')
    if (!existsSync(project))
      continue

    const typecheck = runNuxt(project, ['nuxi', 'typecheck'])
    const build = runNuxt(project, ['nuxt', 'build'])
    rmSync(join(project, '.output'), { recursive: true, force: true })
    const files = listFiles(project)
    const raw = findRawDesignValues(project, files)
    const handBuilt = findHandBuiltStyles(project, files)

    const expectations: Expectation[] = [
      { text: 'typecheck passes', passed: typecheck.ok, evidence: typecheck.ok ? 'nuxi typecheck exited 0' : typecheck.output.slice(-1500) },
      { text: 'build passes', passed: build.ok, evidence: build.ok ? 'nuxt build exited 0' : build.output.slice(-1500) },
      { text: 'style modules hardcode no colors, lengths, or durations', passed: raw.length === 0, evidence: raw.join('\n') || 'none found' },
      { text: 'app code hand-builds no custom properties or inline style objects', passed: handBuilt.length === 0, evidence: handBuilt.join('\n') || 'none found' },
      ...task.assertions.map((assertion) => {
        const pattern = new RegExp(assertion.pattern)
        const hits = files
          .filter(file => matchesGlob(file, assertion.glob))
          .filter(file => pattern.test(readFileSync(join(project, file), 'utf8')))
        const passed = assertion.expect === 'present' ? hits.length > 0 : hits.length === 0
        return { text: assertion.text, passed, evidence: hits.length > 0 ? `matched in ${hits.join(', ')}` : `no match for /${assertion.pattern}/ in ${assertion.glob}` }
      }),
    ]

    const passed = expectations.filter(expectation => expectation.passed).length
    writeFileSync(join(runTaskDir, 'grading.json'), `${JSON.stringify({
      expectations,
      summary: { passed, failed: expectations.length - passed, total: expectations.length, pass_rate: passed / expectations.length },
    }, null, 2)}\n`)
    rows.push(`${passed === expectations.length ? '✓' : '✗'} ${task.name.padEnd(18)} ${passed}/${expectations.length}${expectations.filter(e => !e.passed).map(e => `\n    ✗ ${e.text}`).join('')}`)
  }
  console.log(rows.join('\n'))
}

/** Every fenced TypeScript, Vue, or Pug block in the shipped skills, keyed `<file>#<n>` (n counts every fence in the file). */
function readSkillBlocks(): Map<string, string> {
  const blocks = new Map<string, string>()
  for (const file of listFiles(skillsDir).filter(file => file.endsWith('.md')).sort()) {
    const source = readFileSync(join(skillsDir, file), 'utf8')
    const fences = [...source.matchAll(/^```(\w*)[ \t]*\n([\s\S]*?)^```[ \t]*$/gm)]
    fences.forEach((fence, index) => {
      if (['ts', 'vue', 'pug'].includes(fence[1] ?? ''))
        blocks.set(`${file}#${index + 1}`, fence[2] ?? '')
    })
  }
  return blocks
}

async function verify(): Promise<void> {
  const blocks = readSkillBlocks()
  const problems: string[] = []
  const files = new Map<string, string>()
  const runs = new Set<string>()
  const tests = new Set<string>()

  for (const snippet of skillSnippets as readonly VanitySkillSnippet[]) {
    const code = blocks.get(snippet.block)
    if (code === undefined || !code.startsWith(snippet.startsWith)) {
      problems.push(`${snippet.block}: expected a block starting with ${JSON.stringify(snippet.startsWith)}; update sandbox/skill-evals/snippets.ts`)
      continue
    }
    files.set(snippet.file, `${files.get(snippet.file) ?? ''}${snippet.before ?? ''}${code}${snippet.after ?? ''}`)
    if (snippet.run)
      runs.add(snippet.file)
    if (snippet.test)
      tests.add(snippet.file)
  }

  const mapped = new Set(skillSnippets.map(snippet => snippet.block))
  const unmapped = [...blocks.keys()].filter(block => !mapped.has(block) && !(block in skippedSkillSnippets))
  for (const block of unmapped)
    problems.push(`${block}: not compiled; map it in sandbox/skill-evals/snippets.ts or list why it is skipped`)

  const project = mkdtempSync(join(tmpdir(), 'vanity-skill-snippets-'))
  try {
    cpSync(fixtureDir, project, { recursive: true })
    cpSync(join(evalsDir, 'snippets'), project, { recursive: true })
    linkDependencies(project)
    if (!existsSync(join(project, 'node_modules/vitest')))
      symlinkSync(vitestDir, join(project, 'node_modules/vitest'))
    for (const [file, content] of files) {
      mkdirSync(dirname(join(project, file)), { recursive: true })
      writeFileSync(join(project, file), content)
    }

    // One page reaches every generated style module and component, so the build compiles them.
    const reachable = [...files.keys()].filter(file => file.startsWith('app/skills/') && (file.endsWith('.css.ts') || file.endsWith('.vue')))
    writeFileSync(join(project, 'app/pages/skills.vue'), [
      '<template lang="pug">',
      'p skills',
      '</template>',
      '',
      '<script setup lang="ts">',
      ...reachable.map((file, index) => `import * as m${index} from '~/${file.slice('app/'.length)}'`),
      `void [${reachable.map((_, index) => `m${index}`).join(', ')}]`,
      '</script>',
      '',
    ].join('\n'))

    let built = true
    for (const [label, args] of [['prepare', ['nuxi', 'prepare']], ['typecheck', ['nuxi', 'typecheck']], ['build', ['nuxt', 'build']]] as const) {
      const result = runNuxt(project, args)
      if (!result.ok) {
        problems.push(`${label} failed:\n${result.output.slice(-3000)}`)
        built = false
        break
      }
    }

    if (built) {
      for (const file of runs) {
        try {
          await import(pathToFileURL(join(project, file)).href)
        }
        catch (error) {
          problems.push(`${file} failed when executed: ${(error as Error).message.split('\n')[0]}`)
        }
      }
      if (tests.size > 0) {
        try {
          execFileSync(join(vitestDir, 'vitest.mjs'), ['run', ...tests], { cwd: project, encoding: 'utf8', stdio: 'pipe' })
        }
        catch (error) {
          const failure = error as { stdout?: string, stderr?: string }
          problems.push(`test examples failed:\n${`${failure.stdout ?? ''}${failure.stderr ?? ''}`.slice(-3000)}`)
        }
      }
    }
  }
  finally {
    if (process.env.VANITY_KEEP_SKILL_SNIPPETS)
      console.log(`kept ${project}`)
    else
      rmSync(project, { recursive: true, force: true })
  }

  const skipped = Object.entries(skippedSkillSnippets)
  console.log(`${skillSnippets.length} skill blocks compiled into one fixture; ${runs.size} system examples executed; ${tests.size} test examples run; ${skipped.length} skipped:`)
  for (const [block, reason] of skipped)
    console.log(`  - ${block}: ${reason}`)
  if (problems.length > 0) {
    console.error(`\n✗ ${problems.length} problem(s):\n${problems.map(problem => `  ${problem}`).join('\n')}`)
    process.exitCode = 1
  }
  else {
    console.log('\n✓ every mapped skill block typechecks, builds, and runs')
  }
}

if (command === 'prepare')
  prepare()
else if (command === 'grade')
  grade()
else
  await verify()
