(function () {
  const drawer = document.getElementById("nav-drawer");
  const toggle = document.querySelector(".nav-menu-toggle");
  if (!drawer || !toggle) return;

  const panel = drawer.querySelector(".nav-drawer-panel");
  const overlay = drawer.querySelector(".nav-drawer-overlay");
  const mount = drawer.querySelector("[data-nav-docs-mount]");
  const docsWrap = drawer.querySelector("[data-nav-docs-wrap]");
  const docsStatic = drawer.querySelector("[data-nav-docs-static]");
  const sidebar = document.querySelector(".docs-wrap .sidebar");
  let docsNavClone = null;
  let scrollY = 0;
  let lastFocus = null;

  function backgroundRoots() {
    return Array.from(document.body.children).filter(
      (el) => el !== drawer && !el.matches("header.nav"),
    );
  }

  function setBackgroundInert(inert) {
    for (const el of backgroundRoots()) {
      if (inert) el.setAttribute("inert", "");
      else el.removeAttribute("inert");
    }
  }

  function focusableInPanel() {
    if (!panel) return [];
    return Array.from(
      panel.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
  }

  function lockScroll() {
    scrollY = window.scrollY;
    document.documentElement.classList.add("nav-open");
    document.body.classList.add("nav-open");
    document.body.style.top = `-${scrollY}px`;
  }

  function unlockScroll() {
    document.documentElement.classList.remove("nav-open");
    document.body.classList.remove("nav-open");
    document.body.style.top = "";
    window.scrollTo(0, scrollY);
  }

  function onBackgroundScroll(e) {
    if (!drawer.classList.contains("open")) return;
    if (panel && panel.contains(e.target)) return;
    e.preventDefault();
  }

  function onPanelKeydown(e) {
    if (e.key !== "Tab" || !drawer.classList.contains("open")) return;
    const items = focusableInPanel();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function syncDocsNav() {
    if (!mount || !sidebar) return;
    if (!docsNavClone) {
      docsNavClone = sidebar.cloneNode(true);
      docsNavClone.removeAttribute("class");
      docsNavClone.className = "nav-drawer-docs-nav";
      docsNavClone.setAttribute("aria-label", "Documentation");
      mount.appendChild(docsNavClone);
      const page = document.body.dataset.page;
      if (page) {
        docsNavClone.querySelectorAll("a[data-page]").forEach((a) => {
          if (a.getAttribute("data-page") === page) a.classList.add("active");
        });
      }
      if (docsWrap) docsWrap.hidden = false;
      if (docsStatic) docsStatic.hidden = true;
    }
  }

  function setOpen(open) {
    if (open === drawer.classList.contains("open")) return;

    drawer.classList.toggle("open", open);
    drawer.setAttribute("aria-hidden", open ? "false" : "true");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");

    if (open) {
      lastFocus = document.activeElement;
      lockScroll();
      setBackgroundInert(true);
      drawer.removeAttribute("inert");
      syncDocsNav();
      const closeBtn = drawer.querySelector(".nav-drawer-close");
      requestAnimationFrame(() => {
        if (closeBtn) closeBtn.focus();
      });
    } else {
      setBackgroundInert(false);
      drawer.setAttribute("inert", "");
      unlockScroll();
      const restore = lastFocus && typeof lastFocus.focus === "function" ? lastFocus : toggle;
      requestAnimationFrame(() => restore.focus());
      lastFocus = null;
    }
  }

  function close() {
    setOpen(false);
  }

  toggle.addEventListener("click", () => {
    setOpen(!drawer.classList.contains("open"));
  });

  if (overlay) {
    overlay.addEventListener("click", close);
  }

  drawer.querySelectorAll("[data-nav-close]").forEach((el) => {
    if (el === overlay) return;
    el.addEventListener("click", close);
  });

  drawer.addEventListener("click", (e) => {
    const link = e.target.closest("a[href]");
    if (link && panel && panel.contains(link)) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer.classList.contains("open")) {
      e.preventDefault();
      close();
    }
  });

  if (panel) {
    panel.addEventListener("keydown", onPanelKeydown);
  }

  document.addEventListener("touchmove", onBackgroundScroll, { passive: false });
  document.addEventListener("wheel", onBackgroundScroll, { passive: false });

  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 901px)").matches && drawer.classList.contains("open")) {
      close();
    }
  });

  drawer.setAttribute("inert", "");

  if (sidebar) {
    if (docsStatic) docsStatic.hidden = true;
    syncDocsNav();
    if (docsWrap) docsWrap.hidden = false;
  }
})();
