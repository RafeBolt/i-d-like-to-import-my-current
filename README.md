# Antigravity AI Studio & Shared Data Sync Platform

A unified framework for importing Google AI Studio projects, orchestrating Gemini AI modeling, and maintaining real-time tri-party Shared Data Synchronization between the developer **Workspace**, **Gemini AI Core**, and **Other Parties** (mobile iOS app, web clients, external collaborators).

---

## 🌐 Live Web Preview
Explore and test the interactive dashboard directly in your browser or mobile app:
👉 **[View Live Preview](https://antigravity.luch.dev/site/5a04663d-581c-4f3c-a29b-f225c7fa439b/5bdbbdb254eebd02190527f3/)**

---

## 📥 How to Import from Google AI Studio

Because Google AI Studio accounts are authenticated through personal Google accounts, Antigravity provides three direct import methods:

### Method 1: In-App AI Studio Importer (Recommended)
1. In [Google AI Studio](https://aistudio.google.com), open your prompt or project.
2. Click **"Get Code"** (choose Python, JavaScript, or JSON prompt) or copy the system instructions.
3. Open the **AI Studio Importer** tab in the live web preview or run:
   ```bash
   node src/cli.js import "<path-or-pasted-json>"
   ```
4. The system automatically parses the model, system instructions, generation configuration, and tool declarations, and synchronizes them directly into the shared state store.

### Method 2: Connect GitHub Repository
If your AI Studio project is already hosted on GitHub:
- **Tap the GitHub mark at the top of the chat** to connect your repository.
- Your entire Antigravity workspace and history will link and sync automatically.

---

## 🔄 Tri-Party Shared Data Synchronization

The synchronization engine coordinates state consistency across three parties:

```
    ┌──────────────────────┐         ┌──────────────────────┐
    │      Workspace       │◄───────►│    Gemini AI Core    │
    │  (Local Files, FS)   │         │  (Dynamic Context)   │
    └──────────┬───────────┘         └──────────┬───────────┘
               ▲                                ▲
               │     ┌────────────────────┐     │
               └────►│   Other Parties    │◄────┘
                     │ (iOS, Web Clients) │
                     └────────────────────┘
```

### Features:
1. **Namespaced State Tree**:
   - `workspace.*`: Tracked project files, local storage, build artifacts.
   - `gemini.*`: Active system instructions, dynamic context memory, inference logs.
   - `parties.*`: Connected clients (e.g. `parties.ios` mobile app, web dashboard).
   - `shared.*`: Shared consensus entities, tables, tasks, and configurations.
2. **Vector Clocks & Lamport Sequencing**:
   - Monotonic sequence numbers for all state mutations.
   - Per-party vector clocks (`workspace`, `gemini`, `client`, `external`).
3. **Concurrency & Conflict Auto-Healing**:
   - Detects concurrent updates to identical keys.
   - Last-Write-Wins (LWW) with deep object merging to prevent data loss.
4. **Dynamic AI Context Injection**:
   - Gemini models automatically receive real-time workspace and client state variables in the system instruction memory without manual prompt concatenation.

---

## 🧪 Running Automated Tests

Run the test suite to verify importer functionality, vector clocks, and conflict resolution:

### Node.js Test Suite
```bash
npm test
# or
node tests/sync-engine.test.js
```

### Python Test Suite
```bash
python3 python/test_sync.py
```

---

## 📁 Project Architecture

- **`src/`**
  - [`ai-studio-importer.js`](file:///home/agent/workspace/src/ai-studio-importer.js): Normalizes AI Studio JSON exports, cURL commands, and Python/JS code snippets.
  - [`sync-engine.js`](file:///home/agent/workspace/src/sync-engine.js): Tri-party CRDT-inspired state synchronization engine.
  - [`gemini-service.js`](file:///home/agent/workspace/src/gemini-service.js): Gemini AI modeling service with dynamic context injection.
  - [`server.js`](file:///home/agent/workspace/src/server.js): HTTP & Server-Sent Events (SSE) synchronization server.
  - [`cli.js`](file:///home/agent/workspace/src/cli.js): Command-line utility for importing and inspecting shared state.
- **`python/`**
  - [`ai_studio_importer.py`](file:///home/agent/workspace/python/ai_studio_importer.py): Python AI Studio importer.
  - [`sync_engine.py`](file:///home/agent/workspace/python/sync_engine.py): Python shared state synchronization engine.
  - [`gemini_service.py`](file:///home/agent/workspace/python/gemini_service.py): Python Gemini AI client.
- **`examples/`**
  - [`sample-ai-studio-project.json`](file:///home/agent/workspace/examples/sample-ai-studio-project.json): Reference export from Google AI Studio.
- **`index.html`**, **`style.css`**, **`app.js`**: Interactive web dashboard and visual multi-party simulator.
