const form = document.querySelector("#loginForm");
const input = document.querySelector("#passwordInput");
const error = document.querySelector("#loginError");
const label = document.querySelector("#passwordLabel");
let setupRequired = false;

async function loadAuthStatus() {
  const res = await fetch("/api/auth-status", { cache: "no-store" });
  const status = await res.json();
  setupRequired = Boolean(status.setupRequired);
  if (setupRequired) {
    label.textContent = "第一次使用，請建立登入密碼";
    input.autocomplete = "new-password";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";

  const res = await fetch(setupRequired ? "/api/setup" : "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: input.value })
  });

  if (!res.ok) {
    error.textContent = setupRequired ? "密碼至少 4 碼，請再試一次。" : "密碼錯誤，請再試一次。";
    input.select();
    return;
  }

  location.href = "/";
});

loadAuthStatus().catch(() => {
  error.textContent = "無法讀取登入狀態，請重新整理。";
});
