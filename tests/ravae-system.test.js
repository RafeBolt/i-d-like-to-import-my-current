import assert from 'node:assert/strict';
import { 
  applyRavaeRebrandOverrides, 
  RavaeRecordSystem, 
  VirtualDriveApp, 
  ROOT_FOLDER_ID 
} from '../src/ravae-record-system.js';
import { SyncEngine } from '../src/sync-engine.js';

console.log("=== RUNNING RAVAE RECORD SYSTEM TESTS ===");

// 1. Rebranding rules
console.log("Testing rebranding overrides...");
assert.equal(
  applyRavaeRebrandOverrides("Produced by Yung Ravae for Ravae Records"),
  "Produced by VaeDaVisonary for Ravae Record"
);
assert.equal(
  applyRavaeRebrandOverrides("yung ravae - summer vibe"),
  "VaeDaVisonary - summer vibe"
);
assert.equal(
  applyRavaeRebrandOverrides("Old Ravae Catalog Track 4"),
  "VaeDaVisonary Catalog Track 4"
);
assert.equal(
  applyRavaeRebrandOverrides("OLD RAVAE BEAT TAPE"),
  "VaeDaVisonary BEAT TAPE"
);
assert.equal(
  applyRavaeRebrandOverrides("Ravae Records Official"),
  "Ravae Record Official"
);
console.log("  PASS: Rebranding rules verified");

// 2. Ingestion & Super Admin Review System
console.log("Testing ingestion and review workflow...");
const drive = new VirtualDriveApp();
const system = new RavaeRecordSystem({ driveApp: drive });

// Test Producer upload
const upload1 = system.uploadNewWork(
  "Yung Ravae",
  "Producer",
  "yung ravae - Midnight Heat.wav",
  "Exclusive"
);

assert.equal(upload1.status, "SUCCESS");
assert.equal(upload1.creator, "VaeDaVisonary");
assert.equal(upload1.fileName, "VaeDaVisonary - Midnight Heat.wav");
assert.equal(upload1.roleFolder, "Producers");
assert.ok(upload1.fileId);

// Test Content Creator upload
const upload2 = system.uploadNewWork(
  "Studio Host",
  "Content_Creator",
  "Ravae Records - Ep 1 Promo.mp4",
  "Work-for-Hire"
);
assert.equal(upload2.status, "SUCCESS");
assert.equal(upload2.roleFolder, "Content_Creators");
assert.equal(upload2.fileName, "Ravae Record - Ep 1 Promo.mp4");

// 3. Super Admin Review Queue
const queue = system.getSuperAdminReviewQueue();
assert.equal(queue.length, 2);

const stagedProducerWork = queue.find(q => q.fileId === upload1.fileId);
assert.ok(stagedProducerWork);
assert.equal(stagedProducerWork.creator, "VaeDaVisonary");
assert.equal(stagedProducerWork.status, "PENDING_SUPER_ADMIN_REVIEW");
console.log("  PASS: Ingestion & Super Admin Queue verified");

// 4. Approval & Cataloging
console.log("Testing Super Admin approval and beat cataloging...");
const approval = system.approveAndCatalogBeat(upload1.fileId, ["01_Catalog", "Beats", "VaeDaVisonary"]);
assert.equal(approval.status, "APPROVED");
assert.equal(approval.targetPath, "01_Catalog/Beats/VaeDaVisonary");

// Verify file moved out of pending review queue
const queueAfterApproval = system.getSuperAdminReviewQueue();
assert.equal(queueAfterApproval.length, 1);
assert.equal(queueAfterApproval[0].fileId, upload2.fileId);
console.log("  PASS: Approval and catalog move verified");

// 5. Shared Sync Engine Integration
console.log("Testing Shared Sync Engine integration...");
const syncEngine = new SyncEngine();
const syncedSystem = new RavaeRecordSystem({ syncEngine });
syncedSystem.uploadNewWork("Old Ravae", "Beatmaker", "Soul Jam.mp3", "Royalty Split");

const syncedQueue = syncEngine.getByPath("ravae.reviewQueue");
assert.ok(syncedQueue);
assert.equal(syncedQueue.length, 1);
assert.equal(syncedQueue[0].creator, "VaeDaVisonary");
console.log("  PASS: Shared Sync Engine state replication verified");

console.log("=== ALL RAVAE SYSTEM TESTS PASSED ===");
