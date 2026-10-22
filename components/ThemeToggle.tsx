"use client";

export function ThemeToggle() {
  const flip = () => {
    const el = document.documentElement;
    const cur = el.getAttribute("data-theme") ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    el.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch {}
  };
  return <button className="btn sm" onClick={flip} aria-label="Switch between light and dark theme">◐ Theme</button>;
}
