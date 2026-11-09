(() => {
  "use strict";
  const intro = document.getElementById("cosmicIntro");
  if (intro) {
    window.setTimeout(() => {
      intro.classList.add("is-hidden");
      window.setTimeout(() => intro.remove(), 1100);
    }, 4100);
  }
  const starfield = document.getElementById("starfield");
  if (starfield) {
    let seed = 92741;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const count = window.matchMedia("(max-width: 700px)").matches ? 72 : 150;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const star = document.createElement("span");
      const bright = i % 31 === 0;
      star.className = bright ? "star bright" : "star";
      star.style.setProperty("--x", (random() * 100).toFixed(2) + "%");
      star.style.setProperty("--y", (random() * 100).toFixed(2) + "%");
      star.style.setProperty("--size", (bright ? 2.2 + random() * 1.2 : .7 + random() * 1.3).toFixed(2) + "px");
      star.style.setProperty("--opacity", (.25 + random() * .62).toFixed(2));
      star.style.setProperty("--glow", (bright ? 12 : 5 + random() * 5).toFixed(1) + "px");
      star.style.setProperty("--ray", (bright ? 15 + random() * 14 : 0) + "px");
      star.style.setProperty("--duration", (2.4 + random() * 4.8).toFixed(2) + "s");
      star.style.setProperty("--delay", (-random() * 7).toFixed(2) + "s");
      fragment.appendChild(star);
    }
    starfield.appendChild(fragment);
  }

  const form = document.getElementById("loginForm");
  if (!form) return;
  const message = document.getElementById("message");
  const button = document.getElementById("loginButton");
  const loader = document.getElementById("indinextLoader");
  const loaderMessage = document.getElementById("indinextLoaderMessage");
  const showMessage = (text, type = "error") => {
    message.textContent = text;
    message.className = "message" + (type === "success" ? " success" : "");
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const employeeId = document.getElementById("employeeId").value.trim();
    const password = document.getElementById("password").value;
    if (!employeeId || !password) {
      showMessage("Please enter both Employee ID and password.");
      return;
    }
    button.disabled = true;
    showMessage("Signing in securely…", "success");
    try {
      const response = await fetch("https://indiframe-helpdesk-api.mukuls2302.workers.dev/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ employeeId, password })
      });
      let data = {};
      try { data = await response.json(); } catch {}
      if (!response.ok) throw new Error(data.error || "Invalid Employee ID or password");
      if (!data.token) throw new Error("Login response mein token nahi mila.");
      sessionStorage.setItem("indiframe_token", data.token);
      const forceChange = data.mustChangePassword === true;
      sessionStorage.setItem("forcePasswordChange", forceChange ? "true" : "false");
      showMessage(forceChange ? "Password update required. Redirecting…" : "Login successful. Opening your workspace…", "success");
      window.setTimeout(() => {
        window.location.href = forceChange ? "change-password.html" : "dashboard.html";
      }, 420);
    } catch (error) {
      showMessage(error.message === "Failed to fetch" ? "Server se connect nahi ho raha. API connection check karein." : error.message);
      loader?.classList.add("is-hidden");
    } finally {
      button.disabled = false;
      if (!message.classList.contains("success")) loader?.classList.add("is-hidden");
    }
  });
})();