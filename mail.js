(function(){
    emailjs.init("Sy9xnveExMIv1B0rA"); // 👈 replace with your EmailJS Public Key
  })();
  
  function selectColor(el, color) {
    document.querySelectorAll(".color-option").forEach(opt => opt.classList.remove("selected"));
    el.classList.add("selected");
    document.getElementById("user_color").value = color;
    document.getElementById("selected-color-text").innerText = "You selected: " + color;
  }
  
  async function sendMail(e) {
    e.preventDefault();
    const form = e.target;
  
    // Send both emails independently
    const mainEmail = emailjs.sendForm("service_8abmpmo", "template_jkvewo2", form)
      .catch(err => console.warn("Main email failed:", err));
  
    const confirmationEmail = emailjs.send("service_8abmpmo", "template_95v5ltl", {
      user_email: form.user_email.value,
      user_name: form.user_name.value
    }).catch(err => console.warn("Confirmation email failed:", err));
  
    // Wait for both to finish
    await Promise.all([mainEmail, confirmationEmail]);
  
    // Always show success to the user
    document.getElementById("form-status").innerText = "✅ Request sent! Check your email for confirmation.";
    form.reset();
    document.querySelectorAll(".color-option").forEach(opt => opt.classList.remove("selected"));
    document.getElementById("selected-color-text").innerText = "";
  }