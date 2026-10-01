/**
 * Shared Data Synchronization Engine
 * Handles real-time multi-party synchronization between Workspace, Gemini AI,
 * and External Parties (iOS, Web, Collaborators).
 */

import EventEmitter from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

export const PARTIES = {
  WORKSPACE: 'workspace',
  GEMINI: 'gemini',
  CLIENT: 'client',
  EXTERNAL: 'external'
};

export const CONFLICT_STRATEGIES = {
  LAST_WRITE_WINS: 'last_write_wins',
  GEMINI_PRIORITY: 'gemini_priority',
  WORKSPACE_PRIORITY: 'workspace_priority',
  MANUAL_RESOLVE: 'manual_resolve'
};

export class SyncEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.storagePath = options.storagePath || null;
    this.conflictStrategy = options.conflictStrategy || CONFLICT_STRATEGIES.LAST_WRITE_WINS;
    this.sequence = 0;
    this.vectorClocks = {
      [PARTIES.WORKSPACE]: 0,
      [PARTIES.GEMINI]: 0,
      [PARTIES.CLIENT]: 0,
      [PARTIES.EXTERNAL]: 0
    };

    // Namespaced unified state
    this.state = {
      workspace: {
        activeFiles: [],
        status: 'ready',
        lastUpdated: new Date().toISOString(),
        config: {}
      },
      gemini: {
        activeModel: 'gemini-2.5-flash',
        systemPrompt: '',
        contextMemory: {},
        lastInference: null
      },
      parties: {
        ios: { connected: true, lastPing: new Date().toISOString() },
        web: { connected: true, lastPing: new Date().toISOString() }
      },
      shared: {
        version: 1,
        entities: {},
        syncStatus: 'synced',
        metadata: {}
      }
    };

    // Change log and conflict registry
    this.history = [];
    this.conflicts = [];
    this.maxHistoryLength = options.maxHistoryLength || 500;

    // Load persisted state if file exists
    if (this.storagePath && fs.existsSync(this.storagePath)) {
      this.loadFromDisk();
    }
  }

  /**
   * Apply an atomic update from a specific party
   * @param {string} party - Party identifier ('workspace', 'gemini', 'client', etc.)
   * @param {string} path - Dot-notated path (e.g., 'shared.entities.user1')
   * @param {*} value - New value
   * @param {object} meta - Optional metadata (clientTimestamp, author, reason)
   */
  update(party, path, value, meta = {}) {
    if (!party) throw new Error("Update must specify a party");
    if (!path) throw new Error("Update must specify a target path");

    const now = Date.now();
    this.sequence++;
    this.vectorClocks[party] = (this.vectorClocks[party] || 0) + 1;

    const previousValue = this.getByPath(path);
    const hasConflict = this.detectConflict(party, path, meta);

    let resolvedValue = value;
    if (hasConflict) {
      resolvedValue = this.resolveConflict(party, path, value, previousValue, meta);
    }

    // Apply the value to state
    this.setByPath(path, resolvedValue);

    const changeEvent = {
      id: `chg_${this.sequence}_${Math.random().toString(36).substr(2, 5)}`,
      seq: this.sequence,
      party,
      path,
      value: resolvedValue,
      previousValue,
      hadConflict,
      timestamp: now,
      isoTime: new Date(now).toISOString(),
      vectorClocks: { ...this.vectorClocks },
      meta
    };

    // Append to history
    this.history.push(changeEvent);
    if (this.history.length > this.maxHistoryLength) {
      this.history.shift();
    }

    // Persist if configured
    this.saveToDisk();

    // Broadcast events
    this.emit('change', changeEvent);
    this.emit(`change:${party}`, changeEvent);
    this.emit(`change:${path}`, changeEvent);

    return changeEvent;
  }

  /**
   * Batch apply multiple updates atomically
   */
  batchUpdate(party, updates, meta = {}) {
    const results = [];
    for (const item of updates) {
      const res = this.update(party, item.path, item.value, { ...meta, ...item.meta });
      results.push(res);
    }
    this.emit('batch', { party, count: results.length, updates: results });
    return results;
  }

  /**
   * Detect potential concurrency conflicts
   */
  detectConflict(party, path, meta) {
    if (!meta.expectedVersion && !meta.clientTimestamp) {
      return false;
    }

    // Check recent history for concurrent edits to same path by other parties
    const recentEdits = this.history
      .filter(h => h.path === path && h.party !== party)
      .slice(-5);

    if (recentEdits.length === 0) return false;

    const lastOtherEdit = recentEdits[recentEdits.length - 1];
    // If edit was within 2 seconds or higher sequence than expected
    const timeDelta = Date.now() - lastOtherEdit.timestamp;
    if (timeDelta < 2000) {
      return true;
    }

    if (meta.expectedVersion && lastOtherEdit.seq > meta.expectedVersion) {
      return true;
    }

    return false;
  }

  /**
   * Resolve conflict based on configured strategy
   */
  resolveConflict(party, path, proposedValue, currentValue, meta) {
    const conflictRecord = {
      id: `conf_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      path,
      party,
      proposedValue,
      currentValue,
      timestamp: Date.now(),
      strategy: this.conflictStrategy
    };

    let chosenValue = proposedValue;

    switch (this.conflictStrategy) {
      case CONFLICT_STRATEGIES.GEMINI_PRIORITY:
        if (party === PARTIES.GEMINI) {
          chosenValue = proposedValue;
        } else {
          chosenValue = currentValue;
        }
        break;

      case CONFLICT_STRATEGIES.WORKSPACE_PRIORITY:
        if (party === PARTIES.WORKSPACE) {
          chosenValue = proposedValue;
        } else {
          chosenValue = currentValue;
        }
        break;

      case CONFLICT_STRATEGIES.LAST_WRITE_WINS:
      default:
        // Deep merge if both are plain objects
        if (this.isPlainObject(currentValue) && this.isPlainObject(proposedValue)) {
          chosenValue = { ...currentValue, ...proposedValue };
        } else {
          chosenValue = proposedValue;
        }
        break;
    }

    conflictRecord.resolvedValue = chosenValue;
    this.conflicts.push(conflictRecord);
    this.emit('conflict', conflictRecord);

    return chosenValue;
  }

  /**
   * Retrieve state subtree by dot path
   */
  getByPath(dotPath) {
    const parts = dotPath.split('.');
    let curr = this.state;
    for (const part of parts) {
      if (curr === undefined || curr === null) return undefined;
      curr = curr[part];
    }
    return curr;
  }

  /**
   * Set state subtree by dot path (mutates nested objects safely)
   */
  setByPath(dotPath, value) {
    const parts = dotPath.split('.');
    let curr = this.state;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (curr[part] === undefined || curr[part] === null || typeof curr[part] !== 'object') {
        curr[part] = {};
      }
      curr = curr[part];
    }
    curr[parts[parts.length - 1]] = value;
  }

  /**
   * Generate a Gemini AI context snapshot from current shared state
   */
  getGeminiContext() {
    return {
      workspaceStatus: this.state.workspace.status,
      activeFiles: this.state.workspace.activeFiles,
      sharedEntities: this.state.shared.entities,
      contextMemory: this.state.gemini.contextMemory,
      partiesOnline: Object.keys(this.state.parties).filter(p => this.state.parties[p].connected),
      syncSequence: this.sequence
    };
  }

  /**
   * Register a party heartbeat or status
   */
  recordPartyHeartbeat(partyName, status = {}) {
    const existing = this.state.parties[partyName] || {};
    this.state.parties[partyName] = {
      ...existing,
      ...status,
      connected: true,
      lastPing: new Date().toISOString()
    };
    this.emit('party:heartbeat', { party: partyName, status: this.state.parties[partyName] });
  }

  /**
   * Snapshot state for serialization
   */
  getSnapshot() {
    return {
      sequence: this.sequence,
      vectorClocks: { ...this.vectorClocks },
      state: JSON.parse(JSON.stringify(this.state)),
      conflictCount: this.conflicts.length,
      historyLength: this.history.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Persist state to disk
   */
  saveToDisk() {
    if (!this.storagePath) return;
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storagePath, JSON.stringify(this.getSnapshot(), null, 2), 'utf-8');
    } catch (e) {
      this.emit('error', new Error(`Failed to persist shared state: ${e.message}`));
    }
  }

  /**
   * Load state from disk
   */
  loadFromDisk() {
    if (!this.storagePath || !fs.existsSync(this.storagePath)) return;
    try {
      const raw = fs.readFileSync(this.storagePath, 'utf-8');
      const data = JSON.parse(raw);
      if (data.state) {
        this.state = data.state;
      }
      if (data.sequence) {
        this.sequence = data.sequence;
      }
      if (data.vectorClocks) {
        this.vectorClocks = data.vectorClocks;
      }
    } catch (e) {
      this.emit('error', new Error(`Failed to load shared state: ${e.message}`));
    }
  }

  isPlainObject(obj) {
    return Object.prototype.toString.call(obj) === '[object Object]';
  }
}
