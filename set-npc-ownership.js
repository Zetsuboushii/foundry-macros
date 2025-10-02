/** Set "All Players" (default ownership) to LIMITED for all Actors in the "NPCs" folder.
 *  - Only the folder itself (no subfolders).
 *  - Changes ONLY the default entry ("All Players"), not per-user overrides.
 *  - Requires GM/Assistant.
 */
const FOLDER_NAME = "NPCs";
const { LIMITED } = CONST.DOCUMENT_OWNERSHIP_LEVELS; // LIMITED = 1

function ci(s) { return (s ?? "").toString().trim().toLowerCase(); }

// 1) Find target folder (type "Actor")
const folder = game.folders.find(f => f.type === "Actor" && ci(f.name) === ci(FOLDER_NAME));
if (!folder) return ui.notifications.error(`Folder "${FOLDER_NAME}" not found.`);

// 2) Collect all Actors in this folder
const actorsInFolder = game.actors.contents.filter(a => a.folder?.id === folder.id);
if (!actorsInFolder.length) return ui.notifications.warn(`No Actors found in "${FOLDER_NAME}".`);

// 3) Prepare updates (default ownership → LIMITED)
const updates = actorsInFolder.map(a => ({
  _id: a.id,
  ownership: { ...a.ownership, default: LIMITED }
}));

// 4) Batch update
const updated = await Actor.updateDocuments(updates);
ui.notifications.info(`Ownership set: ${updated.length} Actor(s) in "${FOLDER_NAME}" → All Players = Limited.`);
