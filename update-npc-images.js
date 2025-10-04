// Path to the image folder (relative to the “data” root) — adjust if needed
const IMAGE_BASE = "assets/images/dnd/characters";

// Helper: does a file exist at this path?
async function fileExists(path) {
  try {
    // fetch from the data filesystem
    const resp = await fetch(path, { method: "HEAD" });
    return resp.ok;
  } catch (err) {
    return false;
  }
}

// For a slug, find the appropriate portrait image (prefer “artwork”)
async function findPortraitPath(slug) {
  const variants = [
    `${slug} artwork.png`,
    `${slug}.png`,
    `${slug}.jpg`
  ];
  for (let v of variants) {
    const p = `${IMAGE_BASE}/${v}`;
    if (await fileExists(p)) return p;
  }
  return null;
}

// For a slug, find the token image
async function findTokenPath(slug) {
  const v = `${slug} token.png`;
  const p = `${IMAGE_BASE}/${v}`;
  if (await fileExists(p)) return p;
  return null;
}

(async () => {
  // Find the “NPCs” folder under Actors
  const npcFolder = game.folders.find(f => f.type === "Actor" && f.name === "NPCs");
  if (!npcFolder) {
    ui.notifications.error("No “NPCs” folder found under Actors");
    return;
  }

  // Get all actor documents in that folder
  const actors = npcFolder.contents;
  for (let actor of actors) {
    const name = actor.name;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    // (Adjustment: only allows a–z, 0–9, replaces others with underscore)
    const portrait = await findPortraitPath(slug);
    const tokenImg = await findTokenPath(slug);

    const updateData = {};
    if (portrait) {
      updateData.img = portrait;
      updateData.prototypeToken = updateData.prototypeToken || {};
      updateData.prototypeToken.texture = updateData.prototypeToken.texture || {};
      updateData.prototypeToken.texture.src = portrait;
    }
    if (tokenImg) {
      updateData.prototypeToken = updateData.prototypeToken || {};
      updateData.prototypeToken.texture = updateData.prototypeToken.texture || {};
      updateData.prototypeToken.texture.src = tokenImg;
      // If you want the token also to set “img” inside the Actor data:
      // updateData.token = tokenImg;
    }

    // If we have anything to update
    if (Object.keys(updateData).length > 0) {
      try {
        await actor.update(updateData);
        console.log(`Updated ${actor.name}:`, updateData);
      } catch (err) {
        console.error(`Error updating ${actor.name}:`, err);
      }
    } else {
      console.log(`No image files found for ${actor.name}.`);
    }
  }

  ui.notifications.info("NPC images updated.");
})();
