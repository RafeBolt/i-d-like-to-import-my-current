"""
Python Shared Data Synchronization Engine
Coordinates real-time updates between Workspace, Gemini AI, and External Parties.
"""

import json
import time
import os
from typing import Dict, Any, Optional, List, Callable

PARTIES = {
    "WORKSPACE": "workspace",
    "GEMINI": "gemini",
    "CLIENT": "client",
    "EXTERNAL": "external",
}

class SyncEngine:
    def __init__(self, storage_path: Optional[str] = None):
        self.storage_path = storage_path
        self.sequence = 0
        self.vector_clocks: Dict[str, int] = {
            PARTIES["WORKSPACE"]: 0,
            PARTIES["GEMINI"]: 0,
            PARTIES["CLIENT"]: 0,
            PARTIES["EXTERNAL"]: 0,
        }
        self.state: Dict[str, Any] = {
            "workspace": {
                "activeFiles": [],
                "status": "ready",
                "config": {}
            },
            "gemini": {
                "activeModel": "gemini-2.5-flash",
                "systemPrompt": "",
                "contextMemory": {},
                "lastInference": None
            },
            "parties": {
                "ios": {"connected": True},
                "web": {"connected": True}
            },
            "shared": {
                "version": 1,
                "entities": {},
                "syncStatus": "synced"
            }
        }
        self.history: List[Dict[str, Any]] = []
        self.conflicts: List[Dict[str, Any]] = []
        self.subscribers: List[Callable[[Dict[str, Any]], None]] = []

        if self.storage_path and os.path.exists(self.storage_path):
            self.load_from_disk()

    def subscribe(self, callback: Callable[[Dict[str, Any]], None]):
        self.subscribers.append(callback)

    def update(self, party: str, path: str, value: Any, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        meta = meta or {}
        now = time.time()
        self.sequence += 1
        self.vector_clocks[party] = self.vector_clocks.get(party, 0) + 1

        prev_value = self.get_by_path(path)
        had_conflict = self._detect_conflict(party, path, meta)
        resolved_value = value

        if had_conflict:
            resolved_value = self._resolve_conflict(party, path, value, prev_value, meta)

        self.set_by_path(path, resolved_value)

        event = {
            "id": f"chg_{self.sequence}",
            "seq": self.sequence,
            "party": party,
            "path": path,
            "value": resolved_value,
            "previousValue": prev_value,
            "hadConflict": had_conflict,
            "timestamp": now,
            "vectorClocks": dict(self.vector_clocks),
            "meta": meta
        }

        self.history.append(event)
        self.save_to_disk()

        for sub in self.subscribers:
            try:
                sub(event)
            except Exception:
                pass

        return event

    def _detect_conflict(self, party: str, path: str, meta: Dict[str, Any]) -> bool:
        expected = meta.get("expectedVersion")
        if expected is not None:
            recent = [h for h in self.history if h["path"] == path and h["party"] != party]
            if recent and recent[-1]["seq"] > expected:
                return True
        return False

    def _resolve_conflict(self, party: str, path: str, proposed: Any, current: Any, meta: Dict[str, Any]) -> Any:
        conflict = {
            "path": path,
            "party": party,
            "proposed": proposed,
            "current": current,
            "time": time.time()
        }
        self.conflicts.append(conflict)
        if isinstance(current, dict) and isinstance(proposed, dict):
            merged = dict(current)
            merged.update(proposed)
            return merged
        return proposed

    def get_by_path(self, dot_path: str) -> Any:
        parts = dot_path.split(".")
        curr = self.state
        for p in parts:
            if curr is None or not isinstance(curr, dict):
                return None
            curr = curr.get(p)
        return curr

    def set_by_path(self, dot_path: str, value: Any):
        parts = dot_path.split(".")
        curr = self.state
        for p in parts[:-1]:
            if p not in curr or not isinstance(curr[p], dict):
                curr[p] = {}
            curr = curr[p]
        curr[parts[-1]] = value

    def get_gemini_context(self) -> Dict[str, Any]:
        return {
            "workspaceStatus": self.state["workspace"]["status"],
            "sharedEntities": self.state["shared"]["entities"],
            "contextMemory": self.state["gemini"]["contextMemory"],
            "seq": self.sequence
        }

    def save_to_disk(self):
        if not self.storage_path:
            return
        os.makedirs(os.path.dirname(os.path.abspath(self.storage_path)), exist_ok=True)
        with open(self.storage_path, "w", encoding="utf-8") as f:
            json.dump({
                "sequence": self.sequence,
                "state": self.state,
                "vectorClocks": self.vector_clocks
            }, f, indent=2)

    def load_from_disk(self):
        if not self.storage_path or not os.path.exists(self.storage_path):
            return
        with open(self.storage_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            self.state = data.get("state", self.state)
            self.sequence = data.get("sequence", self.sequence)
            self.vector_clocks = data.get("vectorClocks", self.vector_clocks)
