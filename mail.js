async function sendMail(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.getElementById("form-status");
  if (!form.reportValidity()) return;
  status.textContent = "Sending your request…";
  status.className = "form-status";

  try {
    const payload = Object.fromEntries(new FormData(form).entries());
    const file = document.getElementById("modelFile").files[0];
    payload.model_file = file ? file.name : "";
    payload.model_size = file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "";
    const response = await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("Quote request was rejected");
    status.textContent = "Request sent. We’ll be in touch soon.";
    status.className = "form-status success";
    form.reset();
    document.getElementById("user_color").value = "";
    document.querySelectorAll(".color-option").forEach((option) => option.classList.remove("selected"));
    document.getElementById("selected-color-text").textContent = "Select a color to continue.";
  } catch (error) {
    console.error("Quote request failed", error);
    status.textContent = "We couldn’t send that just now. Please email us directly or try again.";
    status.className = "form-status error";
  }
}

document.getElementById("custom-form")?.addEventListener("submit", sendMail);
