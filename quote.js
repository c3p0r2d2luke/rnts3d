const DEFAULT_SETTINGS = {
  markup: 35,
  basePrice: 8,
  hourlyRate: 4.5,
  colors: [
    { name: "Onyx", hex: "#171923", surcharge: 0 },
    { name: "Cloud", hex: "#f4f1eb", surcharge: 0 },
    { name: "Signal orange", hex: "#ff6b35", surcharge: 2.5 },
    { name: "Ocean blue", hex: "#277da1", surcharge: 1.5 }
  ]
};

function getSettings() {
  return fetch("/api/settings").then((response) => {
    if (!response.ok) throw new Error("Could not load quote settings");
    return response.json();
  }).catch((error) => {
    console.warn("Using default quote settings", error);
    return DEFAULT_SETTINGS;
  });
}

function formatMoney(value) {
  return `$${Number(value).toFixed(2)}`;
}

function formatTime(minutes) {
  const totalMinutes = Math.max(1, Math.round(minutes));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (hours < 24) {
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours} hr${hours === 1 ? "" : "s"}`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}

function estimateFromFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const sizeMb = file.size / 1024 / 1024;
  const fallbackMinutes = Math.max(45, Math.round(sizeMb * 95 + 35));
  return file.arrayBuffer().then((buffer) => {
    let minutes = fallbackMinutes;
    let basis = `${extension?.toUpperCase() || "3D"} complexity estimate`;
    if (extension === "stl") {
      const bytes = new Uint8Array(buffer);
      const binaryTriangles = bytes.length >= 84 ? new DataView(buffer).getUint32(80, true) : 0;
      const isBinary = binaryTriangles > 0 && 84 + binaryTriangles * 50 <= bytes.length;
      const triangles = isBinary ? binaryTriangles : Math.max(1, (new TextDecoder().decode(buffer).match(/\bfacet\b/g) || []).length);
      minutes = Math.max(45, Math.round(35 + triangles / 170));
      basis = `STL complexity · ${triangles.toLocaleString()} facets`;
    } else if (extension === "obj") {
      const text = new TextDecoder().decode(buffer);
      const faces = (text.match(/^f\s/gm) || []).length;
      minutes = Math.max(45, Math.round(40 + Math.max(faces, 1) / 120));
      basis = `OBJ complexity · ${faces.toLocaleString()} faces`;
    }
    return { minutes, basis };
  });
}

function renderColors(settings) {
  const picker = document.getElementById("color-picker");
  picker.innerHTML = "";
  settings.colors.forEach((color, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "color-option";
    button.dataset.name = color.name;
    button.dataset.surcharge = color.surcharge;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-label", `${color.name}, ${formatMoney(color.surcharge)} color adjustment`);
    button.innerHTML = `<span class="swatch" style="background:${color.hex}"></span><span>${color.name}</span>${color.surcharge ? `<small>+${formatMoney(color.surcharge)}</small>` : "<small>Standard</small>"}`;
    button.addEventListener("click", () => {
      document.querySelectorAll(".color-option").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
      document.getElementById("user_color").value = color.name;
      document.getElementById("selected-color-text").textContent = `${color.name} selected · ${color.surcharge ? `+${formatMoney(color.surcharge)}` : "standard price"}`;
      document.getElementById("estimate-color").textContent = color.surcharge ? `+${formatMoney(color.surcharge)}` : "$0.00";
      updateTotal(window.quoteSettings || settings);
    });
    picker.appendChild(button);
    if (index === 0) button.click();
  });
}

let currentModel = null;
function updateTotal(settings) {
  const selected = settings.colors.find((color) => color.name === document.getElementById("user_color")?.value);
  const printHours = (currentModel?.seconds || 0) / 3600;
  const total = (settings.basePrice + printHours * settings.hourlyRate) * (1 + settings.markup / 100) + (selected?.surcharge || 0);
  document.getElementById("estimate-total").textContent = formatMoney(total);
}

document.addEventListener("DOMContentLoaded", () => {
  getSettings().then((settings) => {
    renderColors(settings);
    window.quoteSettings = settings;
    updateTotal(settings);
  });
  const input = document.getElementById("modelFile");
  input?.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const summary = document.getElementById("file-summary");
    summary.classList.remove("hidden");
    summary.textContent = `Slicing ${file.name}…`;
    try {
      const body = new FormData();
      body.append("model", file);
      body.append("machineId", window.quoteSettings?.defaultMachineId || window.quoteSettings?.machines?.[0]?.id || "");
      const response = await fetch("/api/slice", { method: "POST", body });
      if (!response.ok) throw new Error("Slicer unavailable");
      const sliced = await response.json();
      currentModel = { seconds: Math.max(1, sliced.seconds), basis: `${sliced.machine || "Printer"} toolpath analysis` };
    } catch (error) {
      summary.textContent = "This server cannot slice models yet. Please submit the file for a manual quote.";
      currentModel = null;
      document.getElementById("estimate-time").textContent = "Manual review";
      document.getElementById("estimate-basis").textContent = "Slicer unavailable";
      document.getElementById("model-estimate").value = "Manual review required";
      updateTotal(window.quoteSettings);
      return;
    }
    document.getElementById("estimate-time").textContent = formatTime(currentModel.seconds / 60);
    document.getElementById("estimate-basis").textContent = currentModel.basis;
    document.getElementById("model-estimate").value = `${formatTime(currentModel.seconds / 60)} · ${currentModel.basis}`;
    summary.innerHTML = `<strong>${file.name}</strong><span>${(file.size / 1024 / 1024).toFixed(2)} MB · ${currentModel.basis}</span>`;
    getSettings().then((settings) => {
      window.quoteSettings = settings;
      updateTotal(settings);
    });
  });
});
