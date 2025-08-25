import fs from "fs";
import path from "path";

const DB_FILE = path.join("/tmp", "db.json");

function loadDB() {
  if (!fs.existsSync(DB_FILE)) return { users: {} };
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
}

export default function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "id requis" });

  const db = loadDB();
  const u = db.users[id];
  if (!u) return res.status(404).json({ error: "Utilisateur introuvable" });

  res.json({ user: { id: u.id, pseudo: u.pseudo, email: u.email } });
}
