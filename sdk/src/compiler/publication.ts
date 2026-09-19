/** Failure-atomic publication of compiler-owned file artifacts. */

import { chmod, lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import process from 'node:process'
import { VanityError } from '../diagnostics'

export interface FileArtifactCandidate {
  readonly file: string
  readonly contents: string
}

let publicationId = 0

class StalePublication extends Error {
  constructor() {
    super('artifact generation is no longer current')
    this.name = 'StalePublication'
  }
}

interface StagedArtifact extends FileArtifactCandidate {
  readonly temporary: string
  backup?: string
  hadRegularFile: boolean
  committed: boolean
}

/**
 * Publish a set of files as one compiler generation.
 *
 * Every changed file is staged first. Existing regular files are copied to
 * same-directory backups before the first replacement, so a later rename
 * failure or a stale candidate generation can restore the complete prior set.
 * Existing directories and other non-file targets are never moved or
 * removed; if one rejects its replacement, already-published files are still
 * rolled back around it.
 *
 * The operation returns `false` when `canCommit` becomes false. It throws the
 * original filesystem error for a failed write or rename. Temporary files are
 * removed on every path.
 */
export async function writeFileArtifacts(
  candidates: readonly FileArtifactCandidate[],
  canCommit: () => boolean = () => true,
  commit?: () => void,
): Promise<boolean> {
  const unique = new Map<string, FileArtifactCandidate>()
  for (const candidate of candidates) {
    const previous = unique.get(candidate.file)
    if (previous !== undefined && previous.contents !== candidate.contents) {
      throw new TypeError(`artifact publication received conflicting contents for '${candidate.file}'`)
    }
    unique.set(candidate.file, candidate)
  }

  const staged: StagedArtifact[] = []
  const preserveBackups = new Set<string>()
  let published = false
  let failure: unknown

  try {
    if (!canCommit()) {
      throw new StalePublication()
    }

    for (const candidate of unique.values()) {
      const existing = await readArtifactStatIfPresent(candidate.file)
      if (existing?.isFile()
        && await readFile(candidate.file, 'utf8') === candidate.contents) {
        continue
      }

      await mkdir(dirname(candidate.file), { recursive: true })
      const temporary = `${candidate.file}.tmp-${process.pid}-${publicationId++}`
      const artifact: StagedArtifact = {
        ...candidate,
        temporary,
        hadRegularFile: false,
        committed: false,
      }
      // Register the path before writing so a partial write is still cleaned
      // up if the filesystem reports an error.
      staged.push(artifact)
      await writeFile(temporary, candidate.contents, { flag: 'wx' })
    }

    if (!canCommit()) {
      throw new StalePublication()
    }

    for (const artifact of staged) {
      if (!canCommit()) {
        throw new StalePublication()
      }

      const existing = await readArtifactStatIfPresent(artifact.file)
      if (existing !== undefined && !existing.isFile()) {
        throw new VanityError({
          code: 'VANITY_ARTIFACT_TARGET_INVALID',
          message: `'${artifact.file}' is not a regular file, so Vanity cannot publish an artifact there.`,
          file: artifact.file,
          fix: 'remove the directory, link, or device at that path and rebuild',
        })
      }
      if (existing !== undefined) {
        artifact.backup = `${artifact.file}.bak-${process.pid}-${publicationId++}`
        await writeFile(artifact.backup, await readFile(artifact.file), { flag: 'wx' })
        await chmod(artifact.backup, existing.mode & 0o777)
        artifact.hadRegularFile = true
      }

      if (!canCommit()) {
        throw new StalePublication()
      }
      await rename(artifact.temporary, artifact.file)
      artifact.committed = true
    }

    if (!canCommit())
      throw new StalePublication()

    // The compiler swaps its in-memory generation in this same synchronous
    // turn. A stale attempt therefore cannot win the disk boundary and then
    // lose the in-memory boundary in a later microtask.
    commit?.()
    published = true
  }
  catch (error) {
    const rollbackErrors = await restoreCommittedArtifacts(staged)
    for (const artifact of staged) {
      if (artifact.committed && artifact.backup !== undefined)
        preserveBackups.add(artifact.backup)
    }
    failure = rollbackErrors.length === 0
      ? error instanceof StalePublication ? undefined : error
      : new AggregateError(
          [error, ...rollbackErrors],
          `artifact publication failed and rollback was incomplete; recovery files: ${[...preserveBackups].join(', ') || 'none'}`,
        )
  }

  const cleanupErrors = await removeTemporaryArtifacts(staged, preserveBackups)
  if (failure !== undefined) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [failure, ...cleanupErrors],
        'artifact publication failed and temporary-file cleanup was incomplete',
      )
    }
    throw failure
  }

  if (cleanupErrors.length > 0) {
    const cleanupFailure = new AggregateError(cleanupErrors, 'artifact publication left temporary files')
    if (!published)
      throw cleanupFailure
    process.emitWarning(cleanupFailure)
  }
  return published
}

async function readArtifactStatIfPresent(file: string) {
  try {
    return await lstat(file)
  }
  catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT')
      return undefined
    throw error
  }
}

async function restoreCommittedArtifacts(staged: readonly StagedArtifact[]): Promise<unknown[]> {
  const errors: unknown[] = []
  for (const artifact of [...staged].reverse()) {
    if (!artifact.committed)
      continue

    try {
      if (artifact.hadRegularFile && artifact.backup !== undefined) {
        await rename(artifact.backup, artifact.file)
        artifact.backup = undefined
      }
      else {
        await unlink(artifact.file)
      }
      artifact.committed = false
    }
    catch (error) {
      errors.push(error)
    }
  }
  return errors
}

async function removeTemporaryArtifacts(
  staged: readonly StagedArtifact[],
  preserveBackups: ReadonlySet<string>,
): Promise<unknown[]> {
  const errors: unknown[] = []
  for (const artifact of staged) {
    for (const file of [artifact.temporary, ...(artifact.backup === undefined ? [] : [artifact.backup])]) {
      if (preserveBackups.has(file))
        continue
      try {
        await unlink(file)
      }
      catch (error) {
        if (!isNodeError(error) || error.code !== 'ENOENT')
          errors.push(error)
      }
    }
  }
  return errors
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error
}
