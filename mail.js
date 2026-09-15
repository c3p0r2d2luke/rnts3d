async function sendMail(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.getElementById("form-status");
  if (!form.reportValidity()) return;
  status.textContent = "Sending your request…";
  status.className = "form-status";

  try {
    const formData = new FormData(form);
    const file = document.getElementById("modelFile").files[0];
    if (file) formData.set("model_file", file);
    const response = await fetch("/api/quote", {
      method: "POST",
      body: formData
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "Quote request was rejected");
    }
    status.textContent = "Request sent. We’ll be in touch soon.";
    status.className = "form-status success";
    form.reset();
    document.getElementById("user_color").value = "";
    document.querySelectorAll(".color-option").forEach((option) => option.classList.remove("selected"));
    document.getElementById("selected-color-text").textContent = "Select a color to continue.";
  } catch (error) {
    console.error("Quote request failed", error);
    status.textContent = `${error.message || "We couldn’t send that just now."} Please try again.`;
    status.className = "form-status error";
  }
}

document.getElementById("custom-form")?.addEventListener("submit", sendMail);
