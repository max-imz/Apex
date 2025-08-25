import fs from "fs";
import path from "path";

const DB_FILE = path.join("/tmp", "db.json");

function loadDB() {
  if (!fs.existsSync(DB_FILE)) return { users: {} };
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
}

export default function handler(req, res) {
  const { id, token } = req.query;
  if (!id || !token) return res.status(400).send("QR invalide");

  const db = loadDB();
  const u = db.users[id];
  if (!u) return res.status(404).send("QR inconnu.");
  if (token !== u.token) return res.status(401).send("Token invalide.");

  const BASE_URL = "https://" + req.headers.host;
  res.redirect(302, `${BASE_URL}/profile.html?id=${encodeURIComponent(id)}`);
}
