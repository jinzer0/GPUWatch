#!/usr/bin/env node
import { runProcessLedgerSmoke } from './scenarios/process-ledger.mjs';

await runProcessLedgerSmoke();
process.exit(process.exitCode ?? 0);
