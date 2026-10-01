/**
 * Comprehensive Unit & Integration Tests for AI Studio Importer & Shared Sync Engine
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SyncEngine, PARTIES, CONFLICT_STRATEGIES } from '../src/sync-engine.js';
import { AIStudioImporter } from '../src/ai-studio-importer.js';
import { GeminiService } from '../src/gemini-service.js';

async function runTests() {
  console.log("=== RUNNING TEST SUITE ===");
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`  PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  // 1. AI Studio Importer Tests
  test('AIStudioImporter: should parse standard AI Studio JSON export', () => {
    const rawJson = fs.readFileSync('examples/sample-ai-studio-project.json', 'utf-8');
    const project = AIStudioImporter.parse(rawJson);

    assert.equal(project.name, "Intelligent Data Sync & Reasoning Agent");
    assert.equal(project.model, "gemini-2.5-flash");
    assert.ok(project.systemInstruction.includes("Antigravity Shared Intelligence Engine"));
    assert.equal(project.generationConfig.temperature, 0.4);
    assert.equal(project.tools.length, 1);
  });

  test('AIStudioImporter: should extract config from Python code export', () => {
    const pythonCode = `
import google.generativeai as genai

model = genai.GenerativeModel(
    model_name="gemini-1.5-pro",
    system_instruction="You are a data synchronization coordinator."
)
response = model.generate_content("Analyze workspace", generation_config={"temperature": 0.2})
`;
    const project = AIStudioImporter.parse(pythonCode);
    assert.equal(project.detectedFormat, 'code');
    assert.equal(project.model, 'gemini-1.5-pro');
    assert.ok(project.systemInstruction.includes("data synchronization coordinator"));
  });

  test('AIStudioImporter: should generate Node and Python SDK code', () => {
    const rawJson = fs.readFileSync('examples/sample-ai-studio-project.json', 'utf-8');
    const project = AIStudioImporter.parse(rawJson);
    const nodeCode = AIStudioImporter.toNodeCode(project);
    const pythonCode = AIStudioImporter.toPythonCode(project);

    assert.ok(nodeCode.includes("GoogleGenAI"));
    assert.ok(pythonCode.includes("from google import genai"));
  });

  // 2. Shared Data Sync Engine Tests
  test('SyncEngine: should initialize state tree with namespaced partitions', () => {
    const engine = new SyncEngine();
    assert.ok(engine.state.workspace);
    assert.ok(engine.state.gemini);
    assert.ok(engine.state.parties);
    assert.ok(engine.state.shared);
  });

  test('SyncEngine: should apply atomic update with sequence & vector clocks', () => {
    const engine = new SyncEngine();
    const event = engine.update(PARTIES.WORKSPACE, 'shared.entities.datasetA', { rows: 100 });

    assert.equal(event.seq, 1);
    assert.equal(event.party, PARTIES.WORKSPACE);
    assert.equal(engine.getByPath('shared.entities.datasetA.rows'), 100);
    assert.equal(engine.vectorClocks[PARTIES.WORKSPACE], 1);
  });

  test('SyncEngine: should synchronize cross-party updates (Workspace, Gemini, Client)', () => {
    const engine = new SyncEngine();

    // 1. Workspace adds data
    engine.update(PARTIES.WORKSPACE, 'shared.dataStore.source', 'local-fs');
    // 2. Gemini notes inference observation
    engine.update(PARTIES.GEMINI, 'gemini.contextMemory.observation', 'Verified valid schema');
    // 3. Client from iOS pushes approval
    engine.update(PARTIES.CLIENT, 'parties.ios.status', 'approved');

    assert.equal(engine.getByPath('shared.dataStore.source'), 'local-fs');
    assert.equal(engine.getByPath('gemini.contextMemory.observation'), 'Verified valid schema');
    assert.equal(engine.getByPath('parties.ios.status'), 'approved');
    assert.equal(engine.sequence, 3);
  });

  test('SyncEngine: should detect conflict and apply Last-Write-Wins merge', () => {
    const engine = new SyncEngine();
    // Simulate initial state
    engine.update(PARTIES.WORKSPACE, 'shared.config', { theme: 'dark', timeout: 3000 });

    // Client sends concurrent update with expected older sequence
    const conflictedEvent = engine.update(
      PARTIES.CLIENT,
      'shared.config',
      { timeout: 5000, debug: true },
      { expectedVersion: 0 } // Older than current seq 1 -> triggers conflict
    );

    assert.ok(conflictedEvent.hadConflict);
    assert.equal(engine.conflicts.length, 1);

    const merged = engine.getByPath('shared.config');
    assert.equal(merged.theme, 'dark');
    assert.equal(merged.timeout, 5000);
    assert.equal(merged.debug, true);
  });

  test('SyncEngine: should support state persistence and recovery', () => {
    const testStoragePath = 'data/test-shared-state.json';
    const engine1 = new SyncEngine({ storagePath: testStoragePath });
    engine1.update(PARTIES.WORKSPACE, 'shared.persistentItem', 'test-value-123');

    // Create engine2 reading same file
    const engine2 = new SyncEngine({ storagePath: testStoragePath });
    assert.equal(engine2.getByPath('shared.persistentItem'), 'test-value-123');

    // Cleanup
    if (fs.existsSync(testStoragePath)) fs.unlinkSync(testStoragePath);
  });

  // 3. Gemini Service & Dynamic Sync Integration
  await asyncTest('GeminiService: should inject shared context and sync inference', async () => {
    const engine = new SyncEngine();
    const service = new GeminiService();
    service.bindSyncEngine(engine);

    // Set shared state
    engine.update(PARTIES.WORKSPACE, 'shared.metrics', { cpu: '12%', memory: '240MB' });

    // Run inference simulation
    const result = await service.generate({
      prompt: 'Analyze current system state and metrics',
      systemInstruction: 'You are an ops reasoning agent.'
    });

    assert.ok(result.text.length > 0);
    assert.equal(result.finishReason, 'STOP');

    // Verify inference logged back to Gemini shared state partition
    const lastInference = engine.getByPath('gemini.lastInference');
    assert.ok(lastInference);
    assert.ok(lastInference.promptPreview.includes("Analyze"));
  });

  console.log(`\n=== RESULTS: ${passed} Passed, ${failed} Failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
