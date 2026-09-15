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

function slugify(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `printer-${Date.now()}`;
}
function defaultMachineTemplate() {
  return {
    id: "a1-mini",
    name: "A1 Mini",
    material: "PLA",
    width: 180,
    depth: 180,
    height: 180,
    nozzleDiameter: 0.4,
    layerHeight: 0.2,
    infill: 15,
    perimeters: 3,
    printSpeed: 60,
    travelSpeed: 120,
    nozzleTemperature: 205,
    bedTemperature: 60,
    active: true
  };
}
function buildMachineProfile(machine) {
  const defaultProfilePath = path.join(root, "profiles", "default.ini");
  const fallbackProfile = [
    "; Auto-generated RNTS3D printer profile",
    "bed_shape = 0x0,180x0,180x180,0x180",
    "bed_temperature = 60",
    "fill_density = 15%",
    "first_layer_height = 0.2",
    "gcode_flavor = marlin",
    "infill_speed = 60",
    "layer_height = 0.2",
    "nozzle_diameter = 0.4",
    "perimeters = 2",
    "perimeter_speed = 45",
    "printer_technology = FFF",
    "temperature = 205",
    "travel_speed = 120"
  ].join("\n");
  let profile = fs.existsSync(defaultProfilePath) ? fs.readFileSync(defaultProfilePath, "utf8") : fallbackProfile;
  const width = Number(machine.width) || 180;
  const depth = Number(machine.depth) || 180;
  const height = Number(machine.height) || 180;
  const nozzleDiameter = Number(machine.nozzleDiameter) || 0.4;
  const layerHeight = Number(machine.layerHeight) || 0.2;
  const infill = Number(machine.infill) || 15;
  const perimeters = Number(machine.perimeters) || 3;
  const printSpeed = Number(machine.printSpeed) || 60;
  const travelSpeed = Number(machine.travelSpeed) || 120;
  const nozzleTemperature = Number(machine.nozzleTemperature) || 205;
  const bedTemperature = Number(machine.bedTemperature) || 60;

  profile = profile
    .replace(/^bed_shape\s*=.*$/im, `bed_shape = 0x0,${width}x0,${width}x${depth},0x${depth}`)
    .replace(/^bed_temperature\s*=.*$/im, `bed_temperature = ${bedTemperature}`)
    .replace(/^fill_density\s*=.*$/im, `fill_density = ${infill}%`)
    .replace(/^first_layer_height\s*=.*$/im, `first_layer_height = ${Math.min(layerHeight, 0.25)}`)
    .replace(/^infill_speed\s*=.*$/im, `infill_speed = ${printSpeed}`)
    .replace(/^layer_height\s*=.*$/im, `layer_height = ${layerHeight}`)
    .replace(/^nozzle_diameter\s*=.*$/im, `nozzle_diameter = ${nozzleDiameter}`)
    .replace(/^perimeters\s*=.*$/im, `perimeters = ${perimeters}`)
    .replace(/^perimeter_speed\s*=.*$/im, `perimeter_speed = ${printSpeed}`)
    .replace(/^temperature\s*=.*$/im, `temperature = ${nozzleTemperature}`)
    .replace(/^travel_speed\s*=.*$/im, `travel_speed = ${travelSpeed}`);

  if (!/^max_print_height\s*=.*/im.test(profile)) {
    profile += `\nmax_print_height = ${height}\n`;
  } else {
    profile = profile.replace(/^max_print_height\s*=.*$/im, `max_print_height = ${height}`);
  }
  if (!/^printer_name\s*=.*/im.test(profile)) {
    profile += `\nprinter_name = ${machine.name}\n`;
  } else {
    profile = profile.replace(/^printer_name\s*=.*$/im, `printer_name = ${machine.name}`);
  }
  return `${profile.trim()}\n`;
}
function normalizeMachine(machine = {}, index = 0) {
  const template = defaultMachineTemplate();
  const parsed = { ...template, ...machine };
  const normalized = {
    id: slugify(parsed.id || parsed.name || `printer-${index + 1}`),
    name: String(parsed.name || `Printer ${index + 1}`),
    material: parsed.material || "PLA",
    width: Number(parsed.width) || template.width,
    depth: Number(parsed.depth) || template.depth,
    height: Number(parsed.height) || template.height,
    nozzleDiameter: Number(parsed.nozzleDiameter) || template.nozzleDiameter,
    layerHeight: Number(parsed.layerHeight) || template.layerHeight,
    infill: Number(parsed.infill) || template.infill,
    perimeters: Number(parsed.perimeters) || template.perimeters,
    printSpeed: Number(parsed.printSpeed) || template.printSpeed,
    travelSpeed: Number(parsed.travelSpeed) || template.travelSpeed,
    nozzleTemperature: Number(parsed.nozzleTemperature) || template.nozzleTemperature,
    bedTemperature: Number(parsed.bedTemperature) || template.bedTemperature,
    active: index === 0 || Boolean(parsed.active)
  };
  return normalized;
}
function ensureMachineProfiles(settings) {
  const safeSettings = settings && typeof settings === "object" ? settings : { };
  if (!Array.isArray(safeSettings.machines) || safeSettings.machines.length === 0) {
    safeSettings.machines = [defaultMachineTemplate()];
  }
  safeSettings.machines = safeSettings.machines.map((machine, index) => normalizeMachine(machine, index));
  const selected = safeSettings.machines.find((machine) => machine.id === safeSettings.defaultMachineId)
    || safeSettings.machines.find((machine) => machine.active)
    || safeSettings.machines[0];
  safeSettings.defaultMachineId = selected ? selected.id : safeSettings.machines[0].id;
  safeSettings.machines = safeSettings.machines.map((machine) => ({ ...machine, active: machine.id === safeSettings.defaultMachineId }));
  fs.mkdirSync(path.join(root, "profiles"), { recursive: true });
  safeSettings.machines.forEach((machine) => {
    const profilePath = path.join(root, "profiles", `${machine.id}.ini`);
    fs.writeFileSync(profilePath, buildMachineProfile(machine));
  });
  return safeSettings;
}
function readSettings() {
  const raw = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  return ensureMachineProfiles(raw);
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
    const busboy = Busboy({ headers: request.headers, limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
    let machineId = null;
    let model = null;
    const pending = [];
    busboy.on("field", (field, value) => {
      if (field === "machineId") machineId = value || null;
    });
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
      model = { path: filePath, filename: info.filename, machineId };
    });
    busboy.on("finish", () => {
      if (model && machineId) model.machineId = machineId;
      Promise.all(pending).then(() => resolve(model), reject);
    });
    busboy.on("error", reject);
    request.pipe(busboy);
  });
}
function parseQuoteMultipart(request) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: request.headers, limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
    const quote = {};
    let uploadedFile = null;
    let output;
    let filePath;
    const pending = [];
    busboy.on("field", (field, value) => {
      quote[field] = value;
    });
    busboy.on("file", (field, stream, info) => {
      if (field !== "model_file" || !info.filename) return stream.resume();
      fs.mkdirSync(path.join(root, "data", "uploads"), { recursive: true });
      filePath = path.join(root, "data", "uploads", `${crypto.randomUUID()}-${path.basename(info.filename)}`);
      output = fs.createWriteStream(filePath);
      stream.pipe(output);
      pending.push(new Promise((finish, fail) => {
        output.on("finish", finish);
        output.on("error", fail);
      }));
      stream.on("limit", () => reject(new Error("Model file is too large")));
      uploadedFile = { path: filePath, filename: path.basename(info.filename), mimeType: info.mimeType || "application/octet-stream" };
    });
    busboy.on("finish", () => Promise.all(pending).then(() => resolve({ quote, file: uploadedFile }), reject));
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
function runSlicer(modelPath, machineId = null) {
  return new Promise((resolve, reject) => {
    const settings = readSettings();
    const chosenMachine = settings.machines.find((machine) => machine.id === machineId)
      || settings.machines.find((machine) => machine.id === settings.defaultMachineId)
      || settings.machines[0];
    const profilePath = path.join(root, "profiles", `${chosenMachine.id}.ini`);
    const outputPath = `${modelPath}.gcode`;
    const commandTemplate = process.env.SLICER_COMMAND || "LC_ALL=C /usr/bin/prusa-slicer --export-gcode --load {profile} --output {output} {input}";
    const command = commandTemplate
      .replaceAll("{input}", modelPath)
      .replaceAll("{output}", outputPath)
      .replaceAll("{profile}", profilePath);
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
      resolve({ seconds, filename: path.basename(modelPath), machine: chosenMachine.name });
    });
  });
}
async function sendQuoteEmail(quote) {
  if (!process.env.RESEND_API_KEY || !process.env.QUOTE_RECIPIENT) {
    throw new Error("Email delivery is not configured");
  }
  const from = process.env.EMAIL_FROM || "RNTS 3D <onboarding@resend.dev>";
  const details = [
    ["Name", quote.user_name],
    ["Email", quote.user_email],
    ["Color", quote.user_color],
    ["Estimate", quote.model_estimate],
    ["File", quote.model_file ? `${quote.model_file} (${quote.model_size || "size unavailable"})` : "No file uploaded"],
    ["Request", quote.user_request]
  ];
  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const detailRows = details.map(([label, value]) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #e8eceb;color:#718079;font-size:13px;vertical-align:top;width:30%;">${escapeHtml(label)}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e8eceb;color:#1d2a27;font-size:14px;white-space:pre-wrap;">${escapeHtml(value || "Not provided")}</td>
    </tr>`).join("");
  const plainText = details.map(([label, value]) => `${label}: ${value || "Not provided"}`).join("\n");
  const html = (heading, intro, includeAttachmentNote = false) => `
    <div style="margin:0;background:#f5f7f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#1d2a27;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e9e5;border-radius:16px;overflow:hidden;">
        <div style="background:#1d2a27;padding:26px 28px;color:#ffffff;">
          <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#f18458;font-weight:bold;">RNTS 3D</div>
          <h1 style="margin:12px 0 0;font-size:27px;line-height:1.2;">${escapeHtml(heading)}</h1>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 22px;color:#56655f;font-size:15px;line-height:1.6;">${escapeHtml(intro)}</p>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e8eceb;border-radius:10px;overflow:hidden;">${detailRows}</table>
          ${includeAttachmentNote ? `<p style="margin:22px 0 0;padding:13px 15px;background:#fff5ef;border-radius:9px;color:#7c4b38;font-size:13px;line-height:1.5;">The uploaded model is attached to this email for review.</p>` : ""}
        </div>
        <div style="padding:18px 28px;background:#f7f9f8;color:#718079;font-size:12px;">RNTS 3D · Custom printing in Vancouver, Washington</div>
      </div>
    </div>`;
  const attachments = quote.filePath && fs.existsSync(quote.filePath)
    ? [{ filename: quote.model_file, content: fs.readFileSync(quote.filePath).toString("base64") }]
    : [];
  const send = async (to, subject, body, emailAttachments = []) => {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: quote.user_email,
        subject,
        text: plainText,
        html: body,
        ...(emailAttachments.length ? { attachments: emailAttachments } : {})
      })
    });
    if (!response.ok) {
      const responseDetails = await response.text();
      throw new Error(`Email provider returned ${response.status}: ${responseDetails}`);
    }
  };
  await send(
    process.env.QUOTE_RECIPIENT,
    `New 3D print request from ${quote.user_name}`,
    html("New print request", "A new request has arrived. Review the details below and the attached model, if provided.", Boolean(attachments.length)),
    attachments
  );
  await send(
    quote.user_email,
    "We received your RNTS 3D request",
    html("Request received", `Thanks, ${quote.user_name}. We received your request and will review the details before getting back to you.`)
  );
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
    const normalized = ensureMachineProfiles(settings);
    fs.writeFileSync(settingsPath, JSON.stringify(normalized, null, 2) + "\n");
    return send(response, 200, normalized);
  }
  if (url.pathname === "/api/slice" && request.method === "POST") {
    const model = await parseMultipart(request);
    if (!model) return send(response, 400, { error: "A model file is required" });
    try {
      const result = await runSlicer(model.path, model.machineId);
      return send(response, 200, result);
    } catch (error) {
      fs.rmSync(model.path, { force: true });
      console.error("Slicer failed:", error);
      return send(response, 502, { error: "The slicer could not process this model" });
    }
  }
  if (url.pathname === "/api/quote" && request.method === "POST") {
    const { quote, file } = await parseQuoteMultipart(request);
    if (!quote.user_name || !quote.user_email || !quote.user_color || (!quote.user_request && !file)) {
      if (file) fs.rmSync(file.path, { force: true });
      return send(response, 400, { error: "Add a description or upload a model file" });
    }
    if (file) {
      quote.filePath = file.path;
      quote.model_file = file.filename;
      quote.model_size = `${(fs.statSync(file.path).size / 1024 / 1024).toFixed(2)} MB`;
    }
    try {
      await sendQuoteEmail(quote);
      return send(response, 202, { accepted: true, fileReceived: Boolean(file) });
    } catch (error) {
      console.error("Quote email failed:", error);
      return send(response, 502, { error: "The request was received, but the notification email could not be sent. Please try again." });
    }
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
