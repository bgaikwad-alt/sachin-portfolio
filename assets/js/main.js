(function () {
  "use strict";
  document.documentElement.classList.remove("no-js");

  // Fluid hero background
  const canvas = document.querySelector(".hero__canvas");
  if (canvas && window.createFluid) {
    try {
      window.__fluid = window.createFluid(canvas, { interactive: canvas.closest(".hero") });
    } catch (e) {
      console.warn("Fluid background unavailable", e);
    }
  }

  // Reveal on scroll
  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("in"));
  }

  // Active nav link
  const links = [...document.querySelectorAll(".nav__link[href^='#']")];
  const sections = links.map((l) => document.querySelector(l.getAttribute("href"))).filter(Boolean);
  if (sections.length) {
    const setActive = () => {
      const y = window.scrollY + window.innerHeight * 0.35;
      let current = null;
      sections.forEach((s) => { if (s.offsetTop <= y) current = s.id; });
      links.forEach((l) => l.classList.toggle("is-active", l.getAttribute("href") === "#" + current));
    };
    window.addEventListener("scroll", setActive, { passive: true });
    setActive();
  }

  // "Ask me" typewriter tabs
  const ask = document.querySelector("[data-ask]");
  if (ask) {
    const tabs = [...ask.querySelectorAll(".ask__tab")];
    const out = ask.querySelector(".ask__text");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer = 0;
    const show = (tab) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", on);
        t.tabIndex = on ? 0 : -1;
      });
      const text = tab.dataset.answer;
      clearInterval(timer);
      if (reduce) { out.textContent = text; return; }
      let i = 0;
      out.textContent = "";
      timer = setInterval(() => {
        i += 2;
        out.textContent = text.slice(0, i);
        if (i >= text.length) clearInterval(timer);
      }, 16);
    };
    tabs.forEach((t, idx) => {
      t.addEventListener("click", () => show(t));
      t.addEventListener("keydown", (e) => {
        const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const next = tabs[(idx + d + tabs.length) % tabs.length];
        next.focus();
        show(next);
      });
    });
    // Start typing when the block scrolls into view
    let started = false;
    const io2 = new IntersectionObserver((en) => {
      if (en[0].isIntersecting && !started) { started = true; show(tabs[0]); io2.disconnect(); }
    });
    io2.observe(ask);
  }

  // Lightbox for case-study galleries (images within one gallery cycle together)
  const box = document.querySelector(".lightbox");
  if (box && typeof box.showModal === "function") {
    const img = box.querySelector("img");
    const count = box.querySelector(".lightbox__count");
    let list = [], idx = 0;
    const show = (i) => {
      idx = (i + list.length) % list.length;
      const src = list[idx];
      img.src = src.currentSrc || src.src;
      img.alt = src.alt;
      count.textContent = list.length > 1 ? (idx + 1) + " / " + list.length : "";
    };
    document.querySelectorAll(".gallery .zoom").forEach((btn) => {
      btn.addEventListener("click", () => {
        list = [...btn.closest(".gallery").querySelectorAll(".zoom img")];
        show(list.indexOf(btn.querySelector("img")));
        box.showModal();
      });
    });
    box.querySelector(".lightbox__close").addEventListener("click", () => box.close());
    box.querySelector(".lightbox__prev").addEventListener("click", () => show(idx - 1));
    box.querySelector(".lightbox__next").addEventListener("click", () => show(idx + 1));
    box.addEventListener("click", (e) => { if (e.target === box) box.close(); });
    box.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") show(idx + 1);
      if (e.key === "ArrowLeft") show(idx - 1);
    });
  }

  document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
})();
