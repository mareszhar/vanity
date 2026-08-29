#!/usr/bin/env node

import process from 'node:process'
import { runVanityCli } from '../dist/cli.mjs'

runVanityCli().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
