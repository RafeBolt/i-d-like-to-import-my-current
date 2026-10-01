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
from ravae_record_system import apply_ravae_rebrand_overrides, RavaeRecordSystem

class TestRavaeRecordSystem(unittest.TestCase):
    def test_rebranding_rules(self):
        rebranded = apply_ravae_rebrand_overrides("Produced by Yung Ravae for Ravae Records")
        self.assertEqual(rebranded, "Produced by VaeDaVisonary for Ravae Record")
        
        self.assertEqual(apply_ravae_rebrand_overrides("Old Ravae loop"), "VaeDaVisonary loop")
        self.assertEqual(apply_ravae_rebrand_overrides("OLD RAVAE"), "VaeDaVisonary")

    def test_ingestion_and_super_admin_catalog(self):
        sys_obj = RavaeRecordSystem()
        up = sys_obj.upload_new_work("Yung Ravae", "Producer", "yung ravae - fire.wav", "Exclusive Rights")
        self.assertEqual(up["creator"], "VaeDaVisonary")
        self.assertEqual(up["fileName"], "VaeDaVisonary - fire.wav")

        queue = sys_obj.get_super_admin_review_queue()
        self.assertEqual(len(queue), 1)

        approved = sys_obj.approve_and_catalog_beat(up["fileId"], ["01_Catalog", "Beats", "VaeDaVisonary"])
        self.assertEqual(approved["status"], "APPROVED")
        self.assertEqual(len(sys_obj.get_super_admin_review_queue()), 0)

if __name__ == "__main__":
    unittest.main()
