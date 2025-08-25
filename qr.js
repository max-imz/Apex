import fs from "fs";
import path from "path";
import QRCode from "qrcode";

const DB_FILE = path.join("/tmp", "db.json");

function loadDB() {
  if (!fs.existsSync(DB_FILE)) return { users: {} };
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
}

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).send("id requis");

  const db = loadDB();
  const u = db.users[id];
  if (!u) return res.status(404).send("Utilisateur introuvable");

  const BASE_URL = "https://" + req.headers.host;
  const qrUrl = `${BASE_URL}/api/r?id=${encodeURIComponent(id)}&token=${encodeURIComponent(u.token)}`;
  const dataUrl = await QRCode.toDataURL(qrUrl, { errorCorrectionLevel: "M", margin: 1, scale: 6 });

  const img = Buffer.from(dataUrl.split(",")[1], "base64");
  res.setHeader("Content-Type", "image/png");
  res.send(img);
}
