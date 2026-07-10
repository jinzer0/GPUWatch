#!/usr/bin/env node
import { runDevFirstRunSmoke } from './scenarios/dev-first-run.mjs';

await runDevFirstRunSmoke();
process.exit(process.exitCode ?? 0);
