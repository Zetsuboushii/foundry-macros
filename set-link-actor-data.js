/** Set the "Link Actor Data" option (actorLink = true) for all Actors in the "NPCs" folder */
const FOLDER_NAME = "NPCs";

// Helper function: case-insensitive comparison
function ci(s) { return (s ?? "").toString().trim().toLowerCase(); }

(async () => {
  // 1) Find the "NPCs" folder
  const folder = game.folders.find(f => f.type === "Actor" && ci(f.name) === ci(FOLDER_NAME));
  if (!folder) {
    return ui.notifications.error(`Folder "${FOLDER_NAME}" not found.`);
  }

  // 2) Filter all Actors in this folder
  const actors = game.actors.contents.filter(a => a.folder?.id === folder.id);
  if (actors.length === 0) {
    return ui.notifications.warn(`No Actors found in folder "${FOLDER_NAME}".`);
  }

  // 3) Prepare updates
  const updates = [];
  for (const actor of actors) {
    // Ensure prototypeToken data exists
    const proto = actor.prototypeToken || {};
    const currLink = proto.actorLink;
    if (currLink === true) {
      // already set → skip
      continue;
    }
    // Only set if not already true
    updates.push({
      _id: actor.id,
      "prototypeToken.actorLink": true
    });
  }

  if (updates.length === 0) {
    return ui.notifications.info(`All Actors in the folder already have "Link Actor Data" enabled.`);
  }

  // 4) Batch update
  const updated = await Actor.updateDocuments(updates);
  ui.notifications.info(`"Link Actor Data" enabled for ${updated.length} Actor(s) in folder "${FOLDER_NAME}".`);
})();
