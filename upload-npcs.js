/** Characters JSON → Actors in folder "Tome", then move unique ones to "NPCs"
 * Import step:
 *  - Portrait logic: If "[name] artwork.png" exists, use that.
 *    Otherwise use "[name].png" / ".jpg" / ".jpeg".
 *  - Token: "[name] token.png"
 *  - Only `name` is used; surname is ignored.
 *
 * Move step:
 *  - Move Actors from "Tome" -> "NPCs" if no same-named Actor exists in "NPCs".
 *  - Case-insensitive comparison.
 *  - Skips duplicates and logs matches/skips.
 *  - Optional: include subfolders of "Tome" (see INCLUDE_SUBFOLDERS).
 */

const ACTOR_TYPE = "npc";

// --- Import configuration ---
const IMPORT_FOLDER_NAME = "Tome";

// --- Move configuration ---
const MOVE_SOURCE_FOLDER_NAME = IMPORT_FOLDER_NAME; // "Tome"
const MOVE_TARGET_FOLDER_NAME = "NPCs";
const INCLUDE_SUBFOLDERS = false; // set to true to include subfolders of "Tome"

// ---------------- Helper functions ----------------
async function getOrCreateActorFolder(name) {
  let folder = game.folders.find(f =>
    f.type === "Actor" && f.name.toLowerCase() === name.toLowerCase()
  );
  if (!folder) folder = await Folder.create({ name, type: "Actor" });
  return folder;
}

function buildBiography(content) {
  if (!content) return "";
  const parts = [];
  if (content.excerpt) parts.push(String(content.excerpt).trim());
  if (Array.isArray(content.sections)) {
    for (const s of content.sections) {
      if (!s) continue;
      const title = s.title ? `\n\n<strong>${s.title}</strong>\n` : "\n\n";
      parts.push(title + (s.text ?? ""));
    }
  }
  return parts.join("\n").trim();
}

function pickFileOnce({ accept = ".json" } = {}) {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error("No file selected."));
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, text: reader.result });
      reader.onerror = () => reject(reader.error ?? new Error("Read error"));
      reader.readAsText(file, "utf-8");
    };
    input.click();
  });
}

async function pickImageFolderAndBrowse() {
  return new Promise(async (resolve, reject) => {
    const fp = new FilePicker({
      type: "folder",
      callback: async (folderPath) => {
        try {
          const { files } = await FilePicker.browse("data", folderPath);
          resolve({ folderPath, files });
        } catch (e) {
          reject(e);
        }
      }
    });
    fp.browse("data");
  });
}

function findByBasenameCaseInsensitive(files, wanted) {
  const w = wanted.toLowerCase();
  return files.find(f => (f.split("/").pop() || "").toLowerCase() === w);
}

function resolveImagesForName(files, displayName) {
  // Slug variant (e.g., "adrian.png", "adrian.jpg", "adrian token.png")
  const slug = displayName.slugify({ lowercase: true, strict: true });

  // URL-encoded variant for the *full* name + " artwork"
  // -> results in exactly "avarne%20artwork.png" etc.
  const encodedArtworkPng = encodeURIComponent(`${displayName} artwork`) + ".png";

  // Candidate list in priority order (portrait):
  const candPortrait = [
    encodedArtworkPng,          // "[Name]%20artwork.png" -> highest priority
    `${slug} artwork.png`,      // "adrian artwork.png" (without %20)
    `${slug}.png`,
    `${slug}.jpg`,
    `${slug}.jpeg`
  ];

  // Token candidate(s):
  const candToken = [
    `${slug} token.png`
  ];

  let portrait = null, token = null;

  for (const w of candPortrait) {
    const hit = findByBasenameCaseInsensitive(files, w);
    if (hit) { portrait = hit; break; }
  }
  for (const w of candToken) {
    const hit = findByBasenameCaseInsensitive(files, w);
    if (hit) { token = hit; break; }
  }
  return { portrait, token };
}

function ci(str) { return (str ?? "").toString().trim().toLowerCase(); }

function isInFolderOrSubfolder(doc, folder) {
  if (!doc.folder) return false;
  if (!INCLUDE_SUBFOLDERS) return doc.folder.id === folder.id;
  let cur = doc.folder;
  while (cur) {
    if (cur.id === folder.id) return true;
    cur = cur.parent;
  }
  return false;
}

// ---------------- Main flow ----------------
(async () => {
  try {
    // ---------- Import step ----------
    const importFolder = await getOrCreateActorFolder(IMPORT_FOLDER_NAME);

    ui.notifications.info("Please select your characters.json …");
    const { name: fileName, text } = await pickFileOnce({ accept: ".json,application/json" });
    let characters = JSON.parse(text);
    if (!Array.isArray(characters)) throw new Error("JSON is not an array of characters.");

    ui.notifications.info("Please select the images folder …");
    const { folderPath: imagesFolderPath, files } = await pickImageFolderAndBrowse();

    const existingMap = new Map(
      game.actors.contents
        .filter(a => a.folder?.id === importFolder.id)
        .map(a => [a.name, a])
    );

    const toCreate = [];
    const toUpdate = [];

    for (const character of characters) {
      const nameRaw = String(character?.name ?? "").trim();
      const displayName = nameRaw || "Unnamed Character";

      const race = String(character?.race ?? "").trim();
      const biography = buildBiography(character?.content);

      const { portrait, token } = resolveImagesForName(files, displayName);

      const docData = {
        name: displayName,
        type: ACTOR_TYPE,
        folder: importFolder.id,
        img: portrait ?? null,
        system: {
          details: {
            race,
            biography: { value: biography }
          },
          attributes: {
            movement: { walk: 30, units: "ft" }
          }
        },
        flags: {
          import: { source: "characters.json", raw: character }
        }
      };

      if (token) {
        foundry.utils.setProperty(docData, "prototypeToken.texture.src", token);
      }

      const exists = existingMap.get(displayName);
      if (exists) {
        toUpdate.push({ _id: exists.id, ...docData });
      } else {
        toCreate.push(docData);
      }
    }

    const createdDocs = toCreate.length ? await Actor.createDocuments(toCreate) : [];
    const updatedDocs = toUpdate.length ? await Actor.updateDocuments(toUpdate) : [];

    ui.notifications.info(
      `Import: ${createdDocs.length} new, ${updatedDocs.length} updated — Folder “${IMPORT_FOLDER_NAME}” (Images from: ${imagesFolderPath}).`
    );

    // ---------- Move step ----------
    // Ensure both folders exist; create target if missing.
    const sourceFolder = importFolder; // "Tome"
    const targetFolder = await getOrCreateActorFolder(MOVE_TARGET_FOLDER_NAME); // "NPCs"

    // Actors in target folder (for duplicate check)
    const targetActors = game.actors.contents.filter(a => isInFolderOrSubfolder(a, targetFolder));
    const targetNameSet = new Set(targetActors.map(a => ci(a.name)));

    // Actors in source folder
    const sourceActors = game.actors.contents.filter(a => isInFolderOrSubfolder(a, sourceFolder));

    if (!sourceActors.length) {
      ui.notifications.warn(
        `No Actors found in folder "${MOVE_SOURCE_FOLDER_NAME}"${INCLUDE_SUBFOLDERS ? " (including subfolders)" : ""}.`
      );
      return;
    }

    const toMove = [];
    const skipped = [];

    for (const a of sourceActors) {
      const n = ci(a.name);
      if (targetNameSet.has(n)) {
        skipped.push(a.name);
        continue;
      }
      toMove.push({ _id: a.id, folder: targetFolder.id });
    }

    if (!toMove.length) {
      ui.notifications.info(
        `Nothing to move — all ${sourceActors.length} Actor(s) already exist with the same names in "${MOVE_TARGET_FOLDER_NAME}".`
      );
      if (skipped.length) console.info(`[Move Tome→NPCs] Skipped (name duplicates):`, skipped);
      return;
    }

    const moved = await Actor.updateDocuments(toMove);
    ui.notifications.info(
      `Moved: ${moved.length} Actor(s) to "${MOVE_TARGET_FOLDER_NAME}". Skipped (duplicates): ${skipped.length}.`
    );
    if (skipped.length) console.info(`[Move Tome→NPCs] Skipped (name duplicates):`, skipped);

  } catch (err) {
    console.error(err);
    ui.notifications.error("Process failed: " + err.message);
  }
})();
