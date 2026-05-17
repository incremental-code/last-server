#!/usr/bin/env node
import { runCli } from '../src/index.js';

await runCli(process.argv.slice(2));
