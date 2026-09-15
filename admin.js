const rows = document.getElementById("color-rows");
const machineList = document.getElementById("machine-list");
const loginPanel = document.getElementById("admin-login");
const adminForm = document.getElementById("admin-form");

function slugify(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `printer-${Date.now()}`;
}

function addColorRow(color = { name: "", hex: "#8b93a7", surcharge: 0 }) {
  const row = document.createElement("div");
  row.className = "color-row";
  row.innerHTML = `<input class="color-name" aria-label="Color name" placeholder="Color name"><input class="color-hex" aria-label="Color swatch" type="color"><label>Extra fee <input class="color-surcharge" aria-label="Color surcharge" type="number" min="0" step=".01"></label><button type="button" class="remove-color" aria-label="Remove color">×</button>`;
  row.querySelector(".color-name").value = color.name;
  row.querySelector(".color-hex").value = color.hex;
  row.querySelector(".color-surcharge").value = color.surcharge;
  row.querySelector(".remove-color").addEventListener("click", () => row.remove());
  rows.appendChild(row);
}

function createMachineCard(machine = {}) {
  const id = machine.id || slugify(machine.name || `printer-${Date.now()}`);
  const card = document.createElement("div");
  card.className = "machine-card";
  card.dataset.machineId = id;
  card.innerHTML = `
    <div class="machine-card-header">
      <strong>Printer profile</strong>
      <label class="active-machine-toggle"><input type="radio" name="default-machine" class="machine-default" ${machine.active ? "checked" : ""}> Active</label>
      <button type="button" class="button button-secondary remove-machine">Delete</button>
    </div>
    <div class="machine-grid">
      <label>Printer name<input class="machine-name" value="${(machine.name || "").replace(/"/g, "&quot;")}" maxlength="60"></label>
      <label>Material<select class="machine-material"><option value="PLA" ${machine.material === "PLA" ? "selected" : ""}>PLA</option><option value="PETG" ${machine.material === "PETG" ? "selected" : ""}>PETG</option><option value="ABS" ${machine.material === "ABS" ? "selected" : ""}>ABS</option><option value="ASA" ${machine.material === "ASA" ? "selected" : ""}>ASA</option><option value="TPU" ${machine.material === "TPU" ? "selected" : ""}>TPU</option></select></label>
      <label>Build width (mm)<input class="machine-width" type="number" min="10" step="1" value="${machine.width || 180}"></label>
      <label>Build depth (mm)<input class="machine-depth" type="number" min="10" step="1" value="${machine.depth || 180}"></label>
      <label>Build height (mm)<input class="machine-height" type="number" min="10" step="1" value="${machine.height || 180}"></label>
      <label>Nozzle diameter (mm)<input class="machine-nozzle" type="number" min="0.1" step="0.05" value="${machine.nozzleDiameter || 0.4}"></label>
      <label>Layer height (mm)<input class="machine-layer" type="number" min="0.05" step="0.01" value="${machine.layerHeight || 0.2}"></label>
      <label>Infill (%)<input class="machine-infill" type="number" min="5" max="100" step="1" value="${machine.infill || 15}"></label>
      <label>Perimeters<input class="machine-perimeters" type="number" min="1" max="12" step="1" value="${machine.perimeters || 3}"></label>
      <label>Print speed (mm/s)<input class="machine-print-speed" type="number" min="10" step="1" value="${machine.printSpeed || 60}"></label>
      <label>Travel speed (mm/s)<input class="machine-travel-speed" type="number" min="10" step="1" value="${machine.travelSpeed || 120}"></label>
      <label>Nozzle temp (°C)<input class="machine-nozzle-temp" type="number" min="120" step="1" value="${machine.nozzleTemperature || 205}"></label>
      <label>Bed temp (°C)<input class="machine-bed-temp" type="number" min="20" step="1" value="${machine.bedTemperature || 60}"></label>
    </div>
  `;
  card.querySelector(".remove-machine").addEventListener("click", () => {
    const remaining = machineList.querySelectorAll(".machine-card").length;
    if (remaining <= 1) {
      const status = document.getElementById("admin-status");
      status.textContent = "Keep at least one printer profile configured.";
      status.className = "form-status error";
      return;
    }
    card.remove();
  });
  return card;
}

function renderMachines(settings) {
  machineList.innerHTML = "";
  settings.machines.forEach((machine) => {
    machineList.appendChild(createMachineCard(machine));
  });
}

async function loadSettings() {
  const response = await fetch("/api/admin/settings");
  if (!response.ok) throw new Error("Could not load settings");
  const settings = await response.json();
  rows.innerHTML = "";
  document.getElementById("markup").value = settings.markup;
  document.getElementById("base-price").value = settings.basePrice;
  document.getElementById("hourly-rate").value = settings.hourlyRate;
  settings.colors.forEach(addColorRow);
  renderMachines(settings);
}

async function unlockAdmin(event) {
  event.preventDefault();
  const status = document.getElementById("admin-login-status");
  status.textContent = "Checking password…";
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: document.getElementById("admin-password-login").value })
  });
  if (!response.ok) {
    status.textContent = "That password is not correct.";
    status.className = "form-status error";
    return;
  }
  loginPanel.classList.add("hidden");
  adminForm.classList.remove("hidden");
  await loadSettings();
}

document.getElementById("admin-login-form").addEventListener("submit", unlockAdmin);
document.getElementById("add-color").addEventListener("click", () => addColorRow());
document.getElementById("add-machine").addEventListener("click", () => {
  machineList.appendChild(createMachineCard({
    id: slugify(`printer-${Date.now()}`),
    name: `Printer ${machineList.querySelectorAll(".machine-card").length + 1}`,
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
    active: machineList.querySelectorAll(".machine-card").length === 0
  }));
});
adminForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.getElementById("admin-status");
  const colors = [...rows.querySelectorAll(".color-row")].map((row) => ({
    name: row.querySelector(".color-name").value.trim(),
    hex: row.querySelector(".color-hex").value,
    surcharge: Number(row.querySelector(".color-surcharge").value) || 0
  })).filter((color) => color.name);
  if (!colors.length) { status.textContent = "Add at least one color."; status.className = "form-status error"; return; }

  const machines = [...machineList.querySelectorAll(".machine-card")].map((card) => {
    const name = card.querySelector(".machine-name").value.trim() || "Unnamed printer";
    const defaultMachineId = machineList.querySelector(".machine-default:checked")?.closest(".machine-card")?.dataset.machineId;
    return {
      id: card.dataset.machineId || slugify(name),
      name,
      material: card.querySelector(".machine-material").value,
      width: Number(card.querySelector(".machine-width").value) || 180,
      depth: Number(card.querySelector(".machine-depth").value) || 180,
      height: Number(card.querySelector(".machine-height").value) || 180,
      nozzleDiameter: Number(card.querySelector(".machine-nozzle").value) || 0.4,
      layerHeight: Number(card.querySelector(".machine-layer").value) || 0.2,
      infill: Number(card.querySelector(".machine-infill").value) || 15,
      perimeters: Number(card.querySelector(".machine-perimeters").value) || 3,
      printSpeed: Number(card.querySelector(".machine-print-speed").value) || 60,
      travelSpeed: Number(card.querySelector(".machine-travel-speed").value) || 120,
      nozzleTemperature: Number(card.querySelector(".machine-nozzle-temp").value) || 205,
      bedTemperature: Number(card.querySelector(".machine-bed-temp").value) || 60,
      active: card.querySelector(".machine-default").checked || card.dataset.machineId === defaultMachineId
    };
  });
  const defaultMachineId = machineList.querySelector(".machine-default:checked")?.closest(".machine-card")?.dataset.machineId || machines[0]?.id;

  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      markup: Number(document.getElementById("markup").value),
      basePrice: Number(document.getElementById("base-price").value),
      hourlyRate: Number(document.getElementById("hourly-rate").value),
      colors,
      defaultMachineId,
      machines
    })
  });
  if (!response.ok) {
    status.textContent = "Your session expired. Refresh and unlock settings again.";
    status.className = "form-status error";
    return;
  }
  status.textContent = "Shared settings saved.";
  status.className = "form-status success";
  await loadSettings();
});
