import fs from "fs";
import path from "path";
import crypto from "crypto";
import QRCode from "qrcode";
import { customAlphabet } from "nanoid";

const DB_FILE = path.join("/tmp", "db.json"); // Vercel → stockage temporaire

function loadDB() {
  if (!fs.existsSync(DB_FILE)) return { users: {} };
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}

function generatePrivateId() {
  const digits = Array.from(crypto.randomBytes(12)).map(b => b % 10).join("");
  return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6,9)}-${digits.slice(9,12)}`;
}
const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_", 20);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const db = loadDB();
  let id;
  do { id = generatePrivateId(); } while (db.users[id]);
  const token = nanoid();

  const BASE_URL = "https://" + req.headers.host;
  const qrUrl = `${BASE_URL}/api/r?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;

  const dataUrl = await QRCode.toDataURL(qrUrl, { errorCorrectionLevel: "M", margin: 1, scale: 6 });

  db.users[id] = { id, token, email: null, pseudo: null, createdAt: new Date().toISOString() };
  saveDB(db);

  res.status(200).json({ id, qrPngBase64: dataUrl, qrUrl });
}
