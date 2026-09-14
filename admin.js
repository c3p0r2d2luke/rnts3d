const rows = document.getElementById("color-rows");
const loginPanel = document.getElementById("admin-login");
const adminForm = document.getElementById("admin-form");

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

async function loadSettings() {
  const response = await fetch("/api/admin/settings");
  if (!response.ok) throw new Error("Could not load settings");
  const settings = await response.json();
  document.getElementById("markup").value = settings.markup;
  document.getElementById("base-price").value = settings.basePrice;
  document.getElementById("hourly-rate").value = settings.hourlyRate;
  settings.colors.forEach(addColorRow);
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
adminForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.getElementById("admin-status");
  const colors = [...rows.querySelectorAll(".color-row")].map((row) => ({
    name: row.querySelector(".color-name").value.trim(),
    hex: row.querySelector(".color-hex").value,
    surcharge: Number(row.querySelector(".color-surcharge").value) || 0
  })).filter((color) => color.name);
  if (!colors.length) { status.textContent = "Add at least one color."; return; }
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markup: Number(document.getElementById("markup").value), basePrice: Number(document.getElementById("base-price").value), hourlyRate: Number(document.getElementById("hourly-rate").value), colors })
  });
  if (!response.ok) {
    status.textContent = "Your session expired. Refresh and unlock settings again.";
    status.className = "form-status error";
    return;
  }
  status.textContent = "Shared settings saved.";
  status.className = "form-status success";
});
