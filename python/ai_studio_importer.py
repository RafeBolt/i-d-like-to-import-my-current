"""
Python Google AI Studio Project Importer & Normalizer
"""

import json
import re
from typing import Dict, Any

class AIStudioImporter:
    @classmethod
    def parse(cls, raw_input: str) -> Dict[str, Any]:
        if not raw_input or not raw_input.strip():
            raise ValueError("Input to AI Studio importer cannot be empty")

        trimmed = raw_input.strip()
        parsed = None

        if trimmed.startswith("{") or trimmed.startswith("["):
            try:
                parsed = json.loads(trimmed)
            except Exception:
                pass

        if not parsed:
            # Code or text
            model_match = re.search(r'model(?:_name)?\s*=\s*[\'"]([^\'"]+)[\'"]', trimmed)
            model = model_match.group(1) if model_match else "gemini-2.5-flash"

            sys_match = re.search(r'system_instruction\s*=\s*(?:f?[\'"]{3}([\s\S]*?)[\'"]{3}|[\'"]([^\'"]+)[\'"])', trimmed)
            system_instruction = ""
            if sys_match:
                system_instruction = (sys_match.group(1) or sys_match.group(2) or "").strip()

            parsed = {
                "name": "Imported Python Project",
                "model": model,
                "systemInstruction": system_instruction,
                "generationConfig": {"temperature": 0.7, "topP": 0.95}
            }

        return cls.normalize(parsed)

    @classmethod
    def normalize(cls, raw: Dict[str, Any]) -> Dict[str, Any]:
        sys_inst = raw.get("systemInstruction") or raw.get("system_instruction") or ""
        if isinstance(sys_inst, dict) and "parts" in sys_inst:
            sys_inst = "\n".join([p.get("text", "") for p in sys_inst["parts"]])

        gen_cfg = raw.get("generationConfig") or raw.get("generation_config") or {}

        model = raw.get("model", "gemini-2.5-flash")
        if model.startswith("models/"):
            model = model.replace("models/", "")
        if "gemini-1.0" in model:
            model = "gemini-2.5-flash"

        return {
            "name": raw.get("name", "AI Studio Project"),
            "model": model,
            "systemInstruction": sys_inst.strip() if isinstance(sys_inst, str) else "",
            "generationConfig": {
                "temperature": gen_cfg.get("temperature", 0.7),
                "topP": gen_cfg.get("topP", 0.95),
                "maxOutputTokens": gen_cfg.get("maxOutputTokens", 8192)
            },
            "tools": raw.get("tools", [])
        }
