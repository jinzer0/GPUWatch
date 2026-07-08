#!/usr/bin/env node
import { runPackagedAppSmoke } from './scenarios/packaged-app.mjs';

await runPackagedAppSmoke();
process.exit(process.exitCode ?? 0);
