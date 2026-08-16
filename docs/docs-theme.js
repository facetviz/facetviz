(function () {
  const STORAGE_KEY = "facetviz:docs-theme";
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  function storedTheme() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === "light" || value === "dark" ? value : null;
    } catch (_error) {
      return null;
    }
  }

  function currentTheme() {
    return root.dataset.docsTheme || (media.matches ? "dark" : "light");
  }

  function updateButton(button) {
    const nextTheme = currentTheme() === "dark" ? "light" : "dark";
    button.dataset.nextTheme = nextTheme;
    button.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
    button.setAttribute("title", `Switch to ${nextTheme} theme`);
    button.setAttribute("aria-pressed", String(currentTheme() === "light"));
    button.querySelector(".docs-theme-icon").textContent =
      nextTheme === "light" ? "☀" : "☾";
    button.querySelector(".docs-theme-label").textContent =
      nextTheme === "light" ? "Light" : "Dark";
  }

  function applyTheme(theme, persist) {
    root.dataset.docsTheme = theme;
    root.style.colorScheme = theme;
    document.querySelectorAll(".docs-theme-toggle").forEach(updateButton);
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch (_error) {
        // Storage can be unavailable in privacy-restricted contexts.
      }
    }
  }

  function mount() {
    if (document.querySelector(".docs-theme-toggle")) return;
    const spacer = document.querySelector("header .spacer, .topbar .spacer");
    if (!spacer) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn docs-theme-toggle";
    button.innerHTML =
      '<span class="docs-theme-icon" aria-hidden="true"></span>' +
      '<span class="docs-theme-label"></span>';
    button.addEventListener("click", () => {
      applyTheme(button.dataset.nextTheme, true);
    });
    spacer.insertAdjacentElement("afterend", button);
    updateButton(button);
  }

  applyTheme(storedTheme() || (media.matches ? "dark" : "light"), false);
  media.addEventListener?.("change", (event) => {
    if (!storedTheme()) applyTheme(event.matches ? "dark" : "light", false);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
