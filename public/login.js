const form = document.querySelector("#loginForm");
const input = document.querySelector("#passwordInput");
const error = document.querySelector("#loginError");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";

  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: input.value })
  });

  if (!res.ok) {
    error.textContent = "密碼錯誤，請再試一次。";
    input.select();
    return;
  }

  location.href = "/";
});
