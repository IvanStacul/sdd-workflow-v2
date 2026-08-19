#!/usr/bin/env node
import {
  runCli,
} from '../src/cli/run.mjs';

runCli().catch((error) => {
  console.error(`sdd-v2: ${error.message}`);
  process.exitCode = 1;
});
