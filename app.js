// app.js — backend
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import QRCode from "qrcode";
import { customAlphabet } from "nanoid";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); // sert l'app HTML

/* ========= CONFIG ========= */
const PORT = process.env.PORT || 3000;
// IMPORTANT : NE PAS mettre d'IP fixe ici. Utilise une variable d'env BASE_URL.
// En dev local sans tunnel, ça restera http://localhost:3000 (ne marche QUE depuis ton PC).
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const DB_FILE   = path.join(__dirname, "db.json");
const OUT_DIR   = path.join(__dirname, "output");
const USERS_TXT = path.join(__dirname, "users.txt");

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

/* ========= HELPERS ========= */
function loadDB() {
  if (!fs.existsSync(DB_FILE)) return { users: {} };
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf-8")); }
  catch { return { users: {} }; }
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}

// ID 12 chiffres -> 000-000-000-000
function generatePrivateId() {
  const digits = Array.from(crypto.randomBytes(12)).map(b => b % 10).join("");
  return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6,9)}-${digits.slice(9,12)}`;
}
// Token 20 chars (jamais affiché)
const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_", 20);

// Regénère users.txt (usage interne ; tu peux y laisser ID/TOKEN car ce fichier n’est pas montré à l’utilisateur)
function regenerateUsersTxt(db) {
  const blocks = Object.values(db.users).map(u => {
    return [
      `Pseudo : ${u.pseudo || "(inconnu)"}`,
      `ID : ${u.id}`,
      `Mot De Passe : ${u.token}`,
      `e-mail : ${u.email || "(non fourni)"}`,
      "-----"
    ].join("\n");
  }).join("\n");
  fs.writeFileSync(USERS_TXT, blocks + (blocks ? "\n" : ""), "utf-8");
}

function escapeHtml(str=""){
  return str.replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m]));
}

/* ========= API ========= */

// 1) Démarrage → crée ID+token et QR (le QR encode une URL vers /r/:id?token=...)
app.post("/start", async (_req, res) => {
  const db = loadDB();
  let id; do { id = generatePrivateId(); } while (db.users[id]);
  const token = nanoid();

  const qrUrl = `${BASE_URL}/r/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`;

  const pngName = `qr_${id.replace(/-/g, "")}.png`;
  const pngPath = path.join(OUT_DIR, pngName);
  const dataUrl = await QRCode.toDataURL(qrUrl, { errorCorrectionLevel: "M", margin: 1, scale: 6 });
  const pngBuffer = Buffer.from(dataUrl.split(",")[1], "base64");
  fs.writeFileSync(pngPath, pngBuffer);

  db.users[id] = { id, token, email: null, pseudo: null, qrFile: pngName, createdAt: new Date().toISOString() };
  saveDB(db);
  regenerateUsersTxt(db);

  // IMPORTANT : On NE renvoie PAS le token au front, et on n’affiche jamais l’ID/token dans l’UI.
  res.json({ id, qrPngBase64: dataUrl, qrFile: pngName, qrUrl });
});

// 2) Email
app.put("/email", (req, res) => {
  const { id, email } = req.body || {};
  if (!id || !email) return res.status(400).json({ error: "id et email requis" });
  const db = loadDB();
  const u = db.users[id];
  if (!u) return res.status(404).json({ error: "Utilisateur introuvable" });
  u.email = String(email).trim();
  u.updatedAt = new Date().toISOString();
  saveDB(db);
  regenerateUsersTxt(db);
  res.json({ ok: true });
});

// 3) Pseudo
app.put("/pseudo", (req, res) => {
  const { id, pseudo } = req.body || {};
  if (!id || !pseudo) return res.status(400).json({ error: "id et pseudo requis" });
  const db = loadDB();
  const u = db.users[id];
  if (!u) return res.status(404).json({ error: "Utilisateur introuvable" });
  u.pseudo = String(pseudo).trim();
  u.updatedAt = new Date().toISOString();
  saveDB(db);
  regenerateUsersTxt(db);
  res.json({ ok: true });
});

// 4) Redirection quand on scanne le QR (vérifie le token côté serveur)
app.get("/r/:id", (req, res) => {
  const { id } = req.params;
  const { token } = req.query;
  const db = loadDB();
  const u = db.users[id];
  if (!u) return res.status(404).send("QR inconnu.");
  if (!token || token !== u.token) return res.status(401).send("Token invalide.");
  return res.redirect(302, `${BASE_URL}/app/profile/${encodeURIComponent(id)}`);
});

// 5) API profil JSON (pour l’app)
app.get("/api/profile/:id", (req, res) => {
  const db = loadDB();
  const u = db.users[req.params.id];
  if (!u) return res.status(404).json({ error: "Utilisateur introuvable" });
  res.json({ user: { id: u.id, pseudo: u.pseudo, email: u.email, qrFile: u.qrFile } });
});

// 6) Servir l’image du QR
app.get("/qr/:id.png", (req, res) => {
  const db = loadDB();
  const u = db.users[req.params.id];
  if (!u || !u.qrFile) return res.status(404).send("QR introuvable.");
  const p = path.join(OUT_DIR, u.qrFile);
  if (!fs.existsSync(p)) return res.status(404).send("QR manquant.");
  res.sendFile(p);
});

// 7) Page profil (NE montre PAS l’ID ni le mot de passe)
app.get("/app/profile/:id", (req, res) => {
  const db = loadDB();
  const u = db.users[req.params.id];
  if (!u) return res.status(404).send("Utilisateur introuvable.");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`
<!doctype html>
<meta charset="utf-8">
<title>Profil</title>
<style>
  body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:24px}
  .muted{color:#666}
  .card{border:1px solid #e6e6e6;border-radius:12px;padding:16px;max-width:720px}
</style>
<div class="card">
  <h1 style="margin:0 0 8px 0;">${u.pseudo ? escapeHtml(u.pseudo) : "Mon compte"}</h1>
  <div class="muted">Email : ${u.email ? escapeHtml(u.email) : "(non fourni)"}</div>
  <p style="margin-top:12px">Bienvenue sur ton profil.</p>
  <img alt="QR" src="${BASE_URL}/qr/${encodeURIComponent(u.id)}.png" style="width:220px;border:1px solid #e6e6e6;border-radius:8px" />
</div>
  `);
});

/* ========= BOOT ========= */
app.listen(PORT, () => console.log(`✅ Backend prêt sur ${BASE_URL}`));
