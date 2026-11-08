(() => {
  "use strict";
  const intro = document.getElementById("cosmicIntro");
  const scene = document.getElementById("solarScene");
  if (!intro || !scene) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    intro.remove();
    return;
  }
  window.setTimeout(() => document.body.classList.add("intro-planets"), 2300);
  window.setTimeout(() => document.body.classList.add("intro-align"), 5300);
  window.setTimeout(() => document.body.classList.add("intro-brand"), 7000);
  window.setTimeout(() => {
    intro.classList.add("is-hidden");
    document.body.classList.remove("intro-planets", "intro-align", "intro-brand");
  }, 9300);
})();
