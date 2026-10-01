"""
Ravae Record - Ingestion & Super Admin Review System (Python Module)
Rebranding rules, folder routing, and queue management.
"""

import re
from datetime import datetime

ROOT_FOLDER_ID = "RAVAE-STUDIO-ROOT"
COMPANY_NAME = "Ravae Record"

PRODUCER_MAPPING = {
    "Yung Ravae": "VaeDaVisonary",
    "yung ravae": "VaeDaVisonary",
    "Old Ravae": "VaeDaVisonary",
    "OLD RAVAE": "VaeDaVisonary",
    "Ravae Records": "Ravae Record",
}

def apply_ravae_rebrand_overrides(text_input: str) -> str:
    """Applies rebranding rules to text inputs and file names."""
    if not text_input or not isinstance(text_input, str):
        return text_input
    
    # Replace Ravae Records -> Ravae Record
    result = text_input.replace("Ravae Records", COMPANY_NAME)
    
    # Map producer aliases -> VaeDaVisonary
    for old_alias, replacement in PRODUCER_MAPPING.items():
        pattern = re.compile(re.escape(old_alias), re.IGNORECASE)
        result = pattern.sub(replacement, result)
        
    return result

class VirtualDriveFile:
    def __init__(self, name: str, file_id: str = None, description: str = ""):
        self.id = file_id or f"file_{int(datetime.now().timestamp() * 1000)}"
        self.name = name
        self.description = description
        self.parent_folder = None
        self.date_created = datetime.now()

    def get_id(self):
        return self.id

    def get_name(self):
        return self.name

    def set_name(self, name):
        self.name = name

    def get_description(self):
        return self.description

    def set_description(self, desc):
        self.description = desc

    def get_url(self):
        return f"https://drive.google.com/open?id={self.id}"

    def move_to(self, target_folder):
        if self.parent_folder and self in self.parent_folder.files:
            self.parent_folder.files.remove(self)
        self.parent_folder = target_folder
        target_folder.files.append(self)

class VirtualDriveFolder:
    def __init__(self, name: str, folder_id: str = None):
        self.id = folder_id or f"folder_{int(datetime.now().timestamp() * 1000)}"
        self.name = name
        self.sub_folders = []
        self.files = []

    def get_id(self):
        return self.id

    def get_name(self):
        return self.name

    def get_folders_by_name(self, name: str):
        return [f for f in self.sub_folders if f.name.lower() == name.lower()]

    def create_folder(self, name: str):
        existing = self.get_folders_by_name(name)
        if existing:
            return existing[0]
        new_folder = VirtualDriveFolder(name)
        self.sub_folders.append(new_folder)
        return new_folder

    def create_file(self, name: str, content: str = ""):
        f = VirtualDriveFile(name=name, description=content)
        f.parent_folder = self
        self.files.append(f)
        return f

class RavaeRecordSystem:
    def __init__(self, root_folder_id: str = ROOT_FOLDER_ID):
        self.root_folder_id = root_folder_id
        self.root = VirtualDriveFolder("RAVAE STUDIO (FILE SYSTEM)", folder_id=root_folder_id)
        # Bootstrap standard folders
        staging = self.root.create_folder("00_Uploads_Pending_Review")
        staging.create_folder("Producers")
        staging.create_folder("Content_Creators")
        catalog = self.root.create_folder("01_Catalog")
        beats = catalog.create_folder("Beats")
        beats.create_folder("VaeDaVisonary")

    def get_or_create_folder_by_path(self, parent_folder, path_segments):
        curr = parent_folder
        for seg in path_segments:
            curr = curr.create_folder(seg)
        return curr

    def upload_new_work(self, creator_name: str, role: str, file_name: str, rights_tier: str):
        clean_creator = apply_ravae_rebrand_overrides(creator_name)
        clean_file_name = apply_ravae_rebrand_overrides(file_name)
        role_folder = "Producers" if ("producer" in role.lower() or "beat" in role.lower()) else "Content_Creators"
        staging = self.get_or_create_folder_by_path(self.root, ["00_Uploads_Pending_Review", role_folder])
        
        staged_file = staging.create_file(clean_file_name)
        staged_file.set_description(
            f"STATUS: PENDING_SUPER_ADMIN_REVIEW\nCreator: {clean_creator}\nRole: {role}\nRights Tier: {rights_tier}"
        )
        return {
            "status": "SUCCESS",
            "fileId": staged_file.get_id(),
            "fileName": clean_file_name,
            "creator": clean_creator,
            "url": staged_file.get_url()
        }

    def get_super_admin_review_queue(self):
        staging = self.get_or_create_folder_by_path(self.root, ["00_Uploads_Pending_Review"])
        queue = []
        for sub in staging.sub_folders:
            for f in sub.files:
                queue.append({
                    "fileId": f.get_id(),
                    "fileName": f.get_name(),
                    "folderName": sub.get_name(),
                    "description": f.get_description(),
                    "url": f.get_url()
                })
        return queue

    def approve_and_catalog_beat(self, file_id: str, target_path_segments):
        staging = self.get_or_create_folder_by_path(self.root, ["00_Uploads_Pending_Review"])
        target_file = None
        for sub in staging.sub_folders:
            for f in sub.files:
                if f.get_id() == file_id:
                    target_file = f
                    break
            if target_file:
                break

        if not target_file:
            raise ValueError(f"File {file_id} not found in staging queue")

        target_folder = self.get_or_create_folder_by_path(self.root, target_path_segments)
        target_file.move_to(target_folder)
        target_file.set_description(target_file.get_description().replace("PENDING_SUPER_ADMIN_REVIEW", "APPROVED"))
        return {
            "status": "APPROVED",
            "fileName": target_file.get_name(),
            "newUrl": target_file.get_url()
        }
