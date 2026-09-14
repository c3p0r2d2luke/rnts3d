const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const Busboy = require("busboy");

const root = __dirname;
function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!Object.prototype.hasOwnProperty.call(process.env, key)) process.env[key] = value;
  }
}
loadEnvFile();
const settingsPath = path.join(root, "data", "settings.json");
const port = Number(process.env.PORT || 3000);
const adminSessions = new Map();
const sessionLifetime = 8 * 60 * 60 * 1000;
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".ico": "image/x-icon", ".glb": "model/gltf-binary", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8" };

function readSettings() {
  return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
}
function send(response, status, body, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(body));
}
function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) request.destroy(new Error("Request too large"));
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}
function parseMultipart(request) {
  return new Promise((resolve, reject) => {
    const type = request.headers["content-type"] || "";
    const busboy = Busboy({ headers: request.headers, limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
    let model;
    const pending = [];
    busboy.on("file", (field, stream, info) => {
      if (field !== "model") return stream.resume();
      const filePath = path.join("/tmp", `rnts3d-${crypto.randomUUID()}-${path.basename(info.filename)}`);
      const output = fs.createWriteStream(filePath);
      stream.pipe(output);
      pending.push(new Promise((finish, fail) => {
        output.on("finish", finish);
        output.on("error", fail);
      }));
      stream.on("limit", () => reject(new Error("Model file is too large")));
      model = { path: filePath, filename: info.filename };
    });
    busboy.on("finish", () => Promise.all(pending).then(() => resolve(model), reject));
    busboy.on("error", reject);
    request.pipe(busboy);
  });
}
function safeEqual(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function createAdminSession() {
  const token = crypto.randomBytes(32).toString("hex");
  adminSessions.set(token, Date.now() + sessionLifetime);
  return token;
}
function isAdminAuthenticated(request) {
  const authorization = request.headers.authorization?.replace("Bearer ", "");
  const cookie = request.headers.cookie?.match(/rnts3d_admin=([^;]+)/)?.[1];
  const token = authorization || cookie;
  const expiresAt = token && adminSessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}
function sessionCookie(token) {
  return `rnts3d_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionLifetime / 1000}`;
}
function getPrivateSettings(request, response) {
  if (!isAdminAuthenticated(request)) {
    send(response, 401, { error: "Unauthorized" });
    return null;
  }
  return readSettings();
}
function runSlicer(modelPath) {
  return new Promise((resolve, reject) => {
    const outputPath = `${modelPath}.gcode`;
    const command = process.env.SLICER_COMMAND
      ?.replaceAll("{input}", modelPath)
      .replaceAll("{output}", outputPath);
    if (!command) return reject(new Error("SLICER_COMMAND is not configured"));
    const child = spawn("/bin/sh", ["-c", command], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr || `Slicer exited with code ${code}`));
      const gcode = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
      const timeMatch = gcode.match(/;TIME:(\d+)/i) || gcode.match(/estimated printing time .*?=\s*(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?/i);
      const seconds = timeMatch?.[1] && !timeMatch[0].includes("estimated")
        ? Number(timeMatch[1])
        : (Number(timeMatch?.[1] || 0) * 3600) + (Number(timeMatch?.[2] || 0) * 60) + Number(timeMatch?.[3] || 0);
      fs.rmSync(modelPath, { force: true });
      fs.rmSync(outputPath, { force: true });
      resolve({ seconds, filename: path.basename(modelPath) });
    });
  });
}
async function sendQuoteEmail(quote) {
  if (!process.env.RESEND_API_KEY || !process.env.QUOTE_RECIPIENT) return;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "RNTS 3D <onboarding@resend.dev>",
      to: [process.env.QUOTE_RECIPIENT],
      reply_to: quote.user_email,
      subject: `New 3D print quote from ${quote.user_name}`,
      text: Object.entries(quote).map(([key, value]) => `${key}: ${value || "Not provided"}`).join("\n")
    })
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
}
async function handleApi(request, response, url) {
  if (url.pathname === "/api/admin/login" && request.method === "POST") {
    const credentials = JSON.parse(await readBody(request));
    if (!safeEqual(credentials.password, process.env.ADMIN_PASSWORD)) return send(response, 401, { error: "Invalid password" });
    const token = createAdminSession();
    return send(response, 200, { authenticated: true }, { "Set-Cookie": sessionCookie(token) });
  }
  if (url.pathname === "/api/admin/session" && request.method === "GET") {
    return send(response, isAdminAuthenticated(request) ? 200 : 401, { authenticated: isAdminAuthenticated(request) });
  }
  if (url.pathname === "/api/admin/settings" && request.method === "GET") {
    const settings = getPrivateSettings(request, response);
    return settings ? send(response, 200, settings) : undefined;
  }
  if (url.pathname === "/api/settings" && request.method === "GET") return send(response, 200, readSettings());
  if (url.pathname === "/api/settings" && request.method === "POST") {
    if (!isAdminAuthenticated(request)) return send(response, 401, { error: "Unauthorized" });
    const settings = JSON.parse(await readBody(request));
    if (!Array.isArray(settings.colors) || !settings.colors.length) return send(response, 400, { error: "At least one color is required" });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    return send(response, 200, settings);
  }
  if (url.pathname === "/api/slice" && request.method === "POST") {
    if (!process.env.SLICER_COMMAND) return send(response, 503, { error: "Slicer is not configured on this server" });
    const model = await parseMultipart(request);
    if (!model) return send(response, 400, { error: "A model file is required" });
    try {
      const result = await runSlicer(model.path);
      return send(response, 200, result);
    } catch (error) {
      fs.rmSync(model.path, { force: true });
      console.error("Slicer failed:", error);
      return send(response, 502, { error: "The slicer could not process this model" });
    }
  }
  if (url.pathname === "/api/quote" && request.method === "POST") {
    const quote = JSON.parse(await readBody(request));
    if (!quote.user_name || !quote.user_email || !quote.user_color || !quote.user_request) return send(response, 400, { error: "Missing required quote details" });
    await sendQuoteEmail(quote);
    return send(response, 202, { accepted: true });
  }
  return send(response, 404, { error: "Not found" });
}
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(request, response, url);
    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = path.resolve(root, `.${requested}`);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return response.writeHead(404).end("Not found");
    response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(response);
  } catch (error) {
    console.error(error);
    send(response, 500, { error: "Server error" });
  }
});
server.listen(port, () => console.log(`RNTS 3D listening on http://localhost:${port}`));
