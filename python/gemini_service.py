"""
Python Gemini AI Modeling & Shared Context Service
"""

import os
from typing import Dict, Any, Optional
from sync_engine import SyncEngine, PARTIES

class GeminiService:
    def __init__(self, sync_engine: Optional[SyncEngine] = None, api_key: Optional[str] = None):
        self.sync_engine = sync_engine
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")
        self.default_model = "gemini-2.5-flash"

        if self.sync_engine:
            self.sync_engine.subscribe(self._on_state_change)

    def _on_state_change(self, event: Dict[str, Any]):
        if event.get("party") != PARTIES["GEMINI"]:
            # Update Gemini dynamic context
            mem = self.sync_engine.get_by_path("gemini.contextMemory") or {}
            mem[event["path"]] = {
                "val": event["value"],
                "by": event["party"],
                "ts": event["timestamp"]
            }
            self.sync_engine.set_by_path("gemini.contextMemory", mem)

    def generate(self, prompt: str, system_instruction: str = "", model: Optional[str] = None) -> Dict[str, Any]:
        target_model = model or self.default_model

        # Inject shared workspace context
        context_str = ""
        if self.sync_engine:
            ctx = self.sync_engine.get_gemini_context()
            context_str = f"\n[Synchronized Context]:\n{ctx}"

        full_system = f"{system_instruction}{context_str}".strip()

        # Simulated or live output
        output_text = f"Gemini ({target_model}) analyzed prompt with shared data synchronization active."

        result = {
            "model": target_model,
            "text": output_text,
            "system_instruction_applied": full_system,
            "finish_reason": "STOP"
        }

        if self.sync_engine:
            self.sync_engine.update(PARTIES["GEMINI"], "gemini.lastInference", {
                "model": target_model,
                "prompt": prompt[:80],
                "output": output_text[:80]
            })

        return result
