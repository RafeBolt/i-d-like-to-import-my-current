"""
Python Unit Test Suite for Sync Engine and AI Studio Importer
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sync_engine import SyncEngine, PARTIES
from ai_studio_importer import AIStudioImporter
from gemini_service import GeminiService

class TestSyncEngine(unittest.TestCase):
    def test_sync_updates(self):
        engine = SyncEngine()
        ev = engine.update(PARTIES["WORKSPACE"], "shared.testKey", 42)
        self.assertEqual(ev["seq"], 1)
        self.assertEqual(engine.get_by_path("shared.testKey"), 42)

    def test_multi_party_flow(self):
        engine = SyncEngine()
        engine.update(PARTIES["WORKSPACE"], "workspace.status", "active")
        engine.update(PARTIES["CLIENT"], "parties.ios.battery", "98%")
        engine.update(PARTIES["GEMINI"], "gemini.observation", "all-clear")

        self.assertEqual(engine.get_by_path("workspace.status"), "active")
        self.assertEqual(engine.get_by_path("parties.ios.battery"), "98%")
        self.assertEqual(engine.get_by_path("gemini.observation"), "all-clear")
        self.assertEqual(engine.sequence, 3)

    def test_ai_studio_importer(self):
        sample = '{"name":"Test AI","model":"gemini-1.5-pro","systemInstruction":{"parts":[{"text":"Be helpful"}]}}'
        res = AIStudioImporter.parse(sample)
        self.assertEqual(res["model"], "gemini-1.5-pro")
        self.assertEqual(res["systemInstruction"], "Be helpful")

    def test_gemini_service_integration(self):
        engine = SyncEngine()
        service = GeminiService(sync_engine=engine)
        engine.update(PARTIES["WORKSPACE"], "shared.metric", 100)

        out = service.generate("Review metrics", "Analyze system")
        self.assertEqual(out["finish_reason"], "STOP")
        self.assertIsNotNone(engine.get_by_path("gemini.lastInference"))

if __name__ == "__main__":
    unittest.main()
