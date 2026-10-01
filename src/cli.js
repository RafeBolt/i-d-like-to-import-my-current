#!/usr/bin/env node
/**
 * Antigravity AI Studio & Sync CLI
 * Command line tool to import AI Studio projects and manage shared sync state.
 */

import fs from 'node:fs';
import path from 'node:path';
import { AIStudioImporter } from './ai-studio-importer.js';
import { SyncEngine, PARTIES } from './sync-engine.js';

const [,, cmd, arg1, arg2] = process.argv;

function showHelp() {
  console.log(`
Antigravity AI Studio & Shared Sync CLI

Usage:
  node src/cli.js import <path-or-string>   Import AI Studio project (JSON or code)
  node src/cli.js sync:status              Display current shared data state
  node src/cli.js sync:update <path> <val> Update shared state as workspace
  node src/cli.js health                   Check sync system health

Examples:
  node src/cli.js import examples/sample-ai-studio-project.json
  node src/cli.js sync:update shared.task '{"title":"Process data"}'
`);
}

async function main() {
  const sync = new SyncEngine({ storagePath: './data/shared-state.json' });

  switch (cmd) {
    case 'import': {
      if (!arg1) {
        console.error("Error: Please provide a file path or JSON string to import.");
        process.exit(1);
      }
      let content = arg1;
      if (fs.existsSync(arg1)) {
        content = fs.readFileSync(arg1, 'utf-8');
      }
      const imported = AIStudioImporter.parse(content);
      console.log("\n Successfully imported AI Studio Project:");
      console.log(`- Name: ${imported.name}`);
      console.log(`- Model: ${imported.model}`);
      console.log(`- Detected format: ${imported.detectedFormat}`);
      console.log(`- System instruction: ${imported.systemInstruction ? imported.systemInstruction.slice(0, 80) + '...' : '(none)'}`);
      console.log(`- Tools: ${imported.tools.length}`);

      sync.update(PARTIES.WORKSPACE, 'gemini.systemPrompt', imported.systemInstruction);
      sync.update(PARTIES.WORKSPACE, 'gemini.activeModel', imported.model);
      sync.update(PARTIES.WORKSPACE, 'gemini.generationConfig', imported.generationConfig);
      sync.update(PARTIES.WORKSPACE, 'shared.importedProject', {
        name: imported.name,
        importedAt: imported.importedAt
      });
      console.log("\n Synchronized into Workspace & Gemini shared state.");
      break;
    }

    case 'sync:status': {
      const snap = sync.getSnapshot();
      console.log(JSON.stringify(snap, null, 2));
      break;
    }

    case 'sync:update': {
      if (!arg1 || !arg2) {
        console.error("Error: Requires <path> and <value>");
        process.exit(1);
      }
      let val = arg2;
      try { val = JSON.parse(arg2); } catch (_) {}
      const res = sync.update(PARTIES.WORKSPACE, arg1, val);
      console.log(` Updated ${arg1}:`, res);
      break;
    }

    case 'health': {
      console.log({
        status: 'healthy',
        sequence: sync.sequence,
        parties: Object.keys(sync.state.parties),
        conflictsResolved: sync.conflicts.length
      });
      break;
    }

    default:
      showHelp();
      break;
  }
}

main().catch(err => {
  console.error("CLI Error:", err.message);
  process.exit(1);
});
