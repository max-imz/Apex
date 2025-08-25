import fs from "fs";
import path from "path";

const DB_FILE = path.join("/tmp", "db.json");

function loadDB() {
  if (!fs.existsSync(DB_FILE)) return { users: {} };
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}

export default function handler(req, res) {
  if (req.method !== "PUT") return res.status(405).end();
  const { id, email } = req.body || {};
  if (!id || !email) return res.status(400).json({ error: "id et email requis" });

  const db = loadDB();
  const u = db.users[id];
  if (!u) return res.status(404).json({ error: "Utilisateur introuvable" });
  u.email = String(email).trim();
  u.updatedAt = new Date().toISOString();
  saveDB(db);
  res.json({ ok: true });
}
