/*
  app.js — language-aware renderer and dataset loader
  - Loads property-aware content from /data/properties/<property>/content.{en,gr}.json
  - Preserves the active property in internal navigation links
  - Renders shared page content without duplicating HTML/CSS/JS per property
  - Loads datasets for attractions/restaurants/beaches and provides simple search/filter
  - Provides WiFi QR image slot and "Copy password" button
*/
(function () {
  "use strict";

  // derive site root from script src so paths work from index or pages/
  const scriptSrc =
    (document.currentScript && document.currentScript.src) || "";
  const SITE_ROOT = scriptSrc.replace(/\/assets\/js\/app\.js$/, "/") || "./";

  // Properties configuration — simplified single-property site
  let PROPERTIES = [{ id: "apt-2", name: "Vardania Smart Stay" }];
  let PROPERTIES_MAP = {
    "apt-2": { id: "apt-2", name: "Vardania Smart Stay" },
  };
  let CURRENT_PROPERTY_META = null;
  let BEACH_DISTANCE_MATRIX = null;
  let RESTAURANT_DISTANCE_MATRIX = null;
  let ATTRACTION_DISTANCE_MATRIX = null;

  function withPropertyParam(url) {
    try {
      const u = new URL(url, location.href);
      if (
        u.protocol === "mailto:" ||
        u.protocol === "tel:" ||
        u.protocol === "javascript:"
      )
        return url;
      // only add for same-origin links (internal navigation)
      if (u.origin !== location.origin) return url;
      const qp = new URLSearchParams(u.search);
      const prop = getCurrentProperty();
      if (prop) qp.set("property", prop);
      u.search = qp.toString();
      return (
        u.pathname +
        (u.search ? "?" + u.search.replace(/^\?/, "") : "") +
        (u.hash || "")
      );
    } catch (e) {
      return url;
    }
  }

  function getCurrentProperty() {
    try {
      const qp = new URLSearchParams(location.search || "");
      const p = qp.get("property");
      if (p && PROPERTIES_MAP[p]) return p;
    } catch (e) {}
    // prefer explicit property metadata if already loaded
    if (CURRENT_PROPERTY_META && CURRENT_PROPERTY_META.id)
      return CURRENT_PROPERTY_META.id;
    return (PROPERTIES && PROPERTIES[0] && PROPERTIES[0].id) || "apt-2";
  }

  function getPropertyDatasetPath(propertyId, datasetFilename) {
    if (!propertyId) propertyId = getCurrentProperty();
    // Single-property layout: datasets may live under data/property/
    return SITE_ROOT + "data/property/" + datasetFilename;
  }

  function showToast(message, type = "success") {
    let toastContainer = document.getElementById("toast-container");
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.id = "toast-container";
      toastContainer.style.cssText = `
        position: fixed;
        top: 40px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10000;
        pointer-events: none;
      `;
      document.body.appendChild(toastContainer);
    }
    const toast = document.createElement("div");
    toast.style.cssText = `
      background: ${type === "success" ? "#28a745" : "#dc3545"};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      margin-bottom: 10px;
      font-weight: bold;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      pointer-events: auto;
      opacity: 0;
      transform: translateY(-20px);
      transition: opacity 0.3s, transform 0.3s;
    `;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    }, 10);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-20px)";
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3000);
  }

  async function loadPropertiesIndex() {
    const p = await fetchJson(SITE_ROOT + "data/properties.json");
    if (p && Array.isArray(p) && p.length) {
      PROPERTIES = p;
      PROPERTIES_MAP = {};
      p.forEach((x) => (PROPERTIES_MAP[x.id] = x));
    }
  }

  function preservePropertyOnLinks() {
    const prop = getCurrentProperty();
    if (!prop) return;
    document.querySelectorAll("a[href]").forEach((a) => {
      try {
        const href = a.getAttribute("href");
        if (!href) return;
        // ignore external and anchors, mailto, tel
        if (
          href.startsWith("#") ||
          href.startsWith("mailto:") ||
          href.startsWith("tel:") ||
          href.startsWith("javascript:")
        )
          return;
        const newHref = withPropertyParam(href);
        a.setAttribute("href", newHref);
      } catch (e) {}
    });
  }

  function setupPropertySwitcher() {
    const btn = document.getElementById("property-btn");
    const list = document.getElementById("property-list");
    if (!btn || !list) return;
    if (btn.dataset.bound === "true") {
      const currentProperty = getCurrentProperty();
      const currentPropertyData =
        PROPERTIES_MAP[currentProperty] || PROPERTIES[0];
      const labelNode = btn.querySelector(".property-label");
      if (labelNode && currentPropertyData)
        labelNode.textContent = currentPropertyData.name;
      list.querySelectorAll(".property-item").forEach((item) => {
        item.setAttribute(
          "aria-selected",
          String(item.getAttribute("data-id") === currentProperty),
        );
      });
      return;
    }
    // populate list
    list.innerHTML = PROPERTIES.map(
      (p) =>
        `<li role="option" data-id="${escapeHtml(p.id)}" class="property-item" aria-selected="false">${escapeHtml(p.name)}</li>`,
    ).join("");
    // show current
    const current = PROPERTIES_MAP[getCurrentProperty()] || PROPERTIES[0];
    const labelNode = btn.querySelector(".property-label");
    if (labelNode && current) labelNode.textContent = current.name;
    list.querySelectorAll(".property-item").forEach((item) => {
      item.setAttribute(
        "aria-selected",
        String(item.getAttribute("data-id") === getCurrentProperty()),
      );
    });

    btn.addEventListener("click", () => {
      list.classList.toggle("open");
      list.hidden = !list.classList.contains("open");
      btn.setAttribute("aria-expanded", String(!list.hidden));
    });
    list.addEventListener("click", (ev) => {
      const li = ev.target.closest(".property-item");
      if (!li) return;
      const id = li.getAttribute("data-id");
      if (!id) return;
      // change property by updating URL (preserve language)
      const qp = new URLSearchParams(location.search);
      qp.set("property", id);
      // navigate to same pathname with new query
      const newUrl = location.pathname + "?" + qp.toString() + location.hash;
      location.href = newUrl;
    });
    // close when clicking outside
    document.addEventListener("click", (ev) => {
      if (!btn.contains(ev.target) && !list.contains(ev.target)) {
        list.classList.remove("open");
        list.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      }
    });
    btn.dataset.bound = "true";
  }

  function getLang() {
    return localStorage.getItem("lang") === "gr" ? "gr" : "en";
  }
  function setLang(lang) {
    localStorage.setItem("lang", lang);
    updateLangButtons(lang);
    // reload content and then re-render cached weather (if any)
    loadContentAndRender(lang).then(() => {
      setupPropertySwitcher();
      preservePropertyOnLinks();
      try {
        if (window.weatherCache) renderWeather(window.weatherCache, lang);
      } catch (e) {}
    });
  }

  function updateLangButtons(active) {
    document.querySelectorAll(".lang-btn").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-lang") === active);
      b.setAttribute(
        "aria-pressed",
        String(b.getAttribute("data-lang") === active),
      );
    });
  }

  async function fetchJson(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Fetch failed");
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  function deepMerge(base, override) {
    if (Array.isArray(base) || Array.isArray(override))
      return override != null ? override : base;
    if (!base || typeof base !== "object")
      return override != null ? override : base;
    if (!override || typeof override !== "object")
      return override != null ? override : base;
    const merged = Object.assign({}, base);
    Object.keys(override).forEach((key) => {
      merged[key] =
        key in base ? deepMerge(base[key], override[key]) : override[key];
    });
    return merged;
  }

  async function loadBeachDistanceMatrix(property) {
    if (!BEACH_DISTANCE_MATRIX) BEACH_DISTANCE_MATRIX = {};
    const key = `beach_${property}`;
    if (BEACH_DISTANCE_MATRIX[key]) return BEACH_DISTANCE_MATRIX[key];
    // Prefer single-property location, fallback to old multi-property layout
    let data =
      (await fetchJson(
        SITE_ROOT + "data/property/beach_distance_matrix.json",
      )) ||
      (await fetchJson(
        SITE_ROOT +
          "data/properties/" +
          property +
          "/beach_distance_matrix.json",
      ));
    BEACH_DISTANCE_MATRIX[key] = data || {};
    return BEACH_DISTANCE_MATRIX[key];
  }

  async function loadRestaurantDistanceMatrix(property) {
    const key = `restaurant_${property}`;
    if (!RESTAURANT_DISTANCE_MATRIX) RESTAURANT_DISTANCE_MATRIX = {};
    if (RESTAURANT_DISTANCE_MATRIX[key]) return RESTAURANT_DISTANCE_MATRIX[key];
    let data =
      (await fetchJson(
        SITE_ROOT + "data/property/restaurant_distance_matrix.json",
      )) ||
      (await fetchJson(
        SITE_ROOT +
          "data/properties/" +
          property +
          "/restaurant_distance_matrix.json",
      ));
    RESTAURANT_DISTANCE_MATRIX[key] = data || {};
    return RESTAURANT_DISTANCE_MATRIX[key];
  }

  async function loadAttractionDistanceMatrix(property) {
    const key = `attraction_${property}`;
    if (!ATTRACTION_DISTANCE_MATRIX) ATTRACTION_DISTANCE_MATRIX = {};
    if (ATTRACTION_DISTANCE_MATRIX[key]) return ATTRACTION_DISTANCE_MATRIX[key];
    let data =
      (await fetchJson(
        SITE_ROOT + "data/property/attraction_distance_matrix.json",
      )) ||
      (await fetchJson(
        SITE_ROOT +
          "data/properties/" +
          property +
          "/attraction_distance_matrix.json",
      ));
    ATTRACTION_DISTANCE_MATRIX[key] = data || {};
    return ATTRACTION_DISTANCE_MATRIX[key];
  }

  async function loadContentAndRender(lang) {
    const property = getCurrentProperty();
    const sharedContent =
      (await fetchJson(SITE_ROOT + "data/content." + lang + ".json")) || {};
    let propertyContent = null;
    let content = null;
    let propMeta = null;
    if (property) {
      // try single-property location first, then fall back to multi-property layout
      const propContentUrl1 =
        SITE_ROOT + "data/property/content." + lang + ".json";
      const propContentUrl2 =
        SITE_ROOT +
        "data/properties/" +
        property +
        "/content." +
        lang +
        ".json";
      propertyContent =
        (await fetchJson(propContentUrl1)) ||
        (await fetchJson(propContentUrl2));
      // try to load property metadata for coordinates etc.
      propMeta =
        (await fetchJson(SITE_ROOT + "data/property/property.json")) ||
        (await fetchJson(
          SITE_ROOT + "data/properties/" + property + "/property.json",
        ));
      if (propMeta && propMeta.coordinates) {
        try {
          WEATHER_COORDS.lat =
            Number(propMeta.coordinates.lat) || WEATHER_COORDS.lat;
          WEATHER_COORDS.lon =
            Number(propMeta.coordinates.lon) || WEATHER_COORDS.lon;
        } catch (e) {}
      }
    }
    content = deepMerge(sharedContent, propertyContent || {});
    CURRENT_PROPERTY_META = propMeta || null;
    if (!content || !Object.keys(content).length) {
      // fallback: basic English shell
      content = {
        site: {
          apartmentName: "Cozy City Apartment",
          welcomeTitle: "Welcome!",
          welcomeText:
            "Your digital guest guide — everything you need during your stay.",
        },
        navCards: [],
        pages: {},
      };
    }

    // Update site title and hero
    const siteNameEl = document.querySelector("[data-site-name]");
    if (siteNameEl && content.site && content.site.apartmentName)
      siteNameEl.textContent = content.site.apartmentName;
    const welcomeTitle = document.querySelector("[data-welcome-title]");
    if (welcomeTitle && content.site && content.site.welcomeTitle)
      welcomeTitle.textContent = content.site.welcomeTitle;
    const welcomeText = document.querySelector("[data-welcome-text]");
    if (welcomeText && content.site && content.site.welcomeText)
      welcomeText.textContent = content.site.welcomeText;
    const heroImg = document.querySelector(".hero-img");
    const heroImagePath =
      (content.site && content.site.heroImage) ||
      (propMeta &&
        (propMeta.heroImage ||
          (propMeta.heroImages && propMeta.heroImages[0]))) ||
      null;
    if (heroImg && heroImagePath) {
      heroImg.src = SITE_ROOT + heroImagePath;
      heroImg.alt =
        (content.site && content.site.heroAlt) ||
        (content.site && content.site.apartmentName) ||
        "Apartment";
    }

    // apply UI labels (back button, generic labels)
    applyUiLabels(content);

    // update nav cards on index
    document.querySelectorAll(".menu-grid .card").forEach((card) => {
      const key = card.getAttribute("data-card-id");
      if (!key) return;
      const nav = (content.navCards || []).find((n) => n.id === key);
      if (nav) {
        const h = card.querySelector("h3");
        const p = card.querySelector("p");
        if (h) {
          // make Accommodation card title case each word
          if (key === "checkin" || key === "accommodation")
            h.textContent = nav.title
              ? nav.title
                  .split(" ")
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(" ")
              : h.textContent;
          else h.textContent = nav.title || h.textContent;
        }
        if (p) p.textContent = nav.subtitle || p.textContent;
      }
    });

    // If on a page with .page-content and data-page attribute, render
    const container = document.querySelector(".page-content[data-page]");
    if (container) {
      const pageKey = container.getAttribute("data-page");
      const pageData = (content.pages && content.pages[pageKey]) || {};
      await renderPage(container, pageKey, pageData, content);
    }
  }

  function applyUiLabels(siteContent) {
    try {
      const ui = (siteContent && siteContent.ui) || {};
      document.querySelectorAll("[data-i18n]").forEach((el) => {
        const key = el.getAttribute("data-i18n");
        if (ui[key]) {
          el.textContent = ui[key];
          if (el.getAttribute("aria-label"))
            el.setAttribute("aria-label", ui[key]);
        }
      });
      // update language buttons' aria labels and flag alts if present in UI
      document.querySelectorAll(".lang-btn").forEach((btn) => {
        const lang = btn.getAttribute("data-lang");
        const labelKey = "lang_" + lang;
        const label =
          ui[labelKey] ||
          (lang === "gr" ? "Switch to Greek" : "Switch to English");
        btn.setAttribute("aria-label", label);
        const img = btn.querySelector("img");
        if (img) {
          const shortKey = "lang_" + lang + "_short";
          img.alt = ui[shortKey] || (lang === "gr" ? "Ελληνικά" : "English");
        }
      });
    } catch (e) {
      /* ignore */
    }
  }

  async function renderPage(container, pageKey, pageData, siteContent) {
    // common header updates
    const pageTitle = document.querySelector("header.page-header h1");
    if (pageTitle && pageData.title) pageTitle.textContent = pageData.title;

    if (pageKey === "wifi") renderWifi(container, pageData, siteContent);
    else if (pageKey === "contacts")
      renderContacts(container, pageData, siteContent);
    else if (pageKey === "neighborhood")
      await renderNeighborhood(container, pageData, siteContent);
    else if (pageKey === "restaurants")
      renderDatasetList(
        container,
        "restaurants",
        "dataset/restaurants.json",
        pageData,
        siteContent,
      );
    else if (pageKey === "attractions")
      renderDatasetList(
        container,
        "attractions",
        "dataset/attractions.json",
        pageData,
        siteContent,
      );
    else if (pageKey === "beaches")
      renderBeaches(container, "dataset/beaches.json", siteContent);
    else if (pageKey === "accommodation" || pageKey === "checkin") {
      renderAccommodation(container, pageData, siteContent);
    } else if (pageKey === "house_rules" || pageKey === "transport") {
      container.innerHTML = renderSimpleSections(pageData);
    } else if (pageKey === "emergency") {
      renderEmergency(container, pageData);
    } else {
      container.innerHTML = '<p class="muted">Content coming soon.</p>';
    }
  }

  function renderAccommodation(container, pageData, siteContent) {
    const rules =
      (siteContent.pages &&
        siteContent.pages.house_rules &&
        siteContent.pages.house_rules.rules) ||
      pageData.rules ||
      [];
    const wifiData = (siteContent.pages && siteContent.pages.wifi) || {};
    const emoji = {
      checkin: "🔑",
      checkout: "🚪",
      late: "⏰",
      ac: "❄️",
      wifi: "📶",
      bbq: "🍖",
      water: "🚰",
      hot: "♨️",
      breakfast: "🥐",
      consumables: "🧴",
      baby: "👶",
      games: "🎲",
      beach: "🚿",
      transfer: "🚐",
      wellness: "💆",
      rules: "📋",
    };
    const ui = Object.assign(
      {},
      (siteContent && siteContent.ui) || {},
      (siteContent && siteContent.accommodation_ui) || {},
    );
    const sections = [
      {
        id: "checkin",
        title: ui.checkinLabel || "Check-in",
        content: pageData.arrival,
      },
      {
        id: "checkout",
        title: ui.checkoutLabel || "Check-out",
        content: pageData.checkout,
      },
      {
        id: "late",
        title: ui.lateCheckoutLabel || "Late Check-out",
        content: pageData.late_checkout,
      },
      {
        id: "transfer",
        title: ui.transferLabel || "Transfers",
        content: pageData.transfer,
      },
      {
        id: "ac",
        title: ui.airConditionLabel || "Air Condition",
        content: pageData.air_condition,
      },
      { id: "water", title: ui.waterLabel || "Water", content: pageData.water },
      {
        id: "hot",
        title: ui.hotWaterLabel || "Hot Water",
        content: pageData.hot_water,
      },
      {
        id: "beach",
        title: ui.beachFaucetLabel || "Beach Faucet",
        content: pageData.beach_faucet,
      },
      {
        id: "breakfast",
        title: ui.breakfastLabel || "Breakfast",
        content: pageData.breakfast,
      },
      { id: "bbq", title: ui.bbqLabel || "BBQ", content: pageData.bbq },
      {
        id: "consumables",
        title: ui.consumablesLabel || "Consumables",
        content: pageData.consumables,
      },
      {
        id: "baby",
        title: ui.babyChairLabel || "Baby Chair",
        content: pageData.baby_chair,
      },
      {
        id: "games",
        title: ui.boardGamesLabel || "Board Games",
        content: pageData.board_games,
      },
      {
        id: "wellness",
        title: ui.wellnessLabel || "Wellness",
        content: pageData.wellness,
      },
      // wifi section to be rendered specially
      {
        id: "wifi",
        title: ui.wifiLabel || "Wi-Fi",
        content:
          wifiData.ssid || wifiData.password || wifiData.notes
            ? `Network: ${wifiData.ssid || ""}\nPassword: ${wifiData.password || ""}\n${wifiData.notes || ""}`
            : "",
      },
    ];
    const visibleSections = sections.filter(
      (s) => s.content && String(s.content).trim(),
    );

    // add a small map section at the top (OpenStreetMap embed for the apartment area)
    let html = "";
    const mapLat = WEATHER_COORDS.lat;
    const mapLon = WEATHER_COORDS.lon;
    const bbox = `${mapLon - 0.02},${mapLat - 0.01},${mapLon + 0.02},${mapLat + 0.01}`;
    const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${mapLat},${mapLon}`;
    html += `<div class="section map-section"><h3>📍 ${ui.mapLabel || "Map"}</h3><div style="height:180px;">`;
    html += `<iframe src="${mapUrl}" style="border:0;width:100%;height:100%;border-radius:8px" loading="lazy"></iframe>`;
    const mapsLink = `https://www.google.com/maps/dir/?api=1&destination=${mapLat},${mapLon}`;
    html += `</div><p class="muted"><a href="${mapsLink}" target="_blank" rel="noopener">${escapeHtml(ui.openInMaps || "Open in Maps")}</a></p></div>`;
    visibleSections.forEach((s) => {
      const em = emoji[s.id] || "";
      const titleText = s.title || "";
      if (s.id === "wifi") {
        // wifi special block with copy button (now collapsible and supports QR image)
        const parts = s.content.split("\n");
        const ssidLine = parts[0] || "";
        const passLine = parts[1] || "";
        const noteLine = parts.slice(2).join(" ") || "";
        const copyLabel =
          (siteContent && siteContent.ui && siteContent.ui.copyPassword) ||
          "Copy password";
        const propertyId =
          (CURRENT_PROPERTY_META && CURRENT_PROPERTY_META.id) ||
          getCurrentProperty();
        const defaultQr =
          SITE_ROOT + "data/property/images/" + propertyId + "-wifi.png";
        const propQr =
          siteContent &&
          siteContent.pages &&
          siteContent.pages.wifi &&
          siteContent.pages.wifi.qrImage
            ? SITE_ROOT + siteContent.pages.wifi.qrImage
            : defaultQr;
        html += `<details class="section" id="wifi-accom"><summary><strong>${em} ${escapeHtml(titleText)}</strong></summary><div class="section-body"><div class="wifi-card"><div class="wifi-info"><p class="muted">${escapeHtml(ssidLine.replace("Network: ", ""))}</p><div class="wifi-password"><span id="wifi-pass-accom" class="muted">${escapeHtml(passLine.replace("Password: ", ""))}</span><button id="copy-pass-accom" class="btn">${escapeHtml(copyLabel)}</button></div>${noteLine ? `<p class="muted">${escapeHtml(noteLine)}</p>` : ""}</div><div class="wifi-qr" data-qr-src="${propQr}"></div></div></div></details>`;
      } else {
        html += `<details class="section" id="${s.id}"><summary><strong>${em} ${escapeHtml(titleText)}</strong></summary><div class="section-body"><p>${escapeHtml(s.content)}</p></div></details>`;
      }
    });

    // house rules merged
    if (rules && rules.length) {
      html += `<div class="section"><h3>📋 ${escapeHtml(ui.houseRulesLabel || "House Rules")}</h3><ul>${rules.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul></div>`;
    }

    container.innerHTML = html;
    // bind copy in accommodation wifi block
    const copyBtnAccom = container.querySelector("#copy-pass-accom");
    if (copyBtnAccom) {
      copyBtnAccom.addEventListener("click", () => {
        const pass = (wifiData && wifiData.password) || "";
        copyToClipboard(pass)
          .then(() => {
            const copiedLabel =
              (siteContent && siteContent.ui && siteContent.ui.copied) ||
              "Copied";
            const copyLabel =
              (siteContent && siteContent.ui && siteContent.ui.copyPassword) ||
              "Copy password";
            copyBtnAccom.textContent = copiedLabel;
            setTimeout(() => (copyBtnAccom.textContent = copyLabel), 1500);
          })
          .catch(() => {
            alert("Copy failed");
          });
      });
    }
    // attempt to load accommodation-specific QR image (if present)
    const accomQrDiv = container.querySelector("#wifi-accom .wifi-qr");
    if (accomQrDiv) {
      const src = accomQrDiv.getAttribute("data-qr-src");
      if (src) {
        const img = new Image();
        img.alt =
          (siteContent && siteContent.ui && siteContent.ui.wifiQrAlt) ||
          "WiFi QR code";
        img.className = "wifi-qr-image";
        img.onload = () => {
          accomQrDiv.innerHTML = "";
          accomQrDiv.appendChild(img);
        };
        img.onerror = () => {
          accomQrDiv.style.display = "none";
        };
        img.src = src;
      } else {
        accomQrDiv.style.display = "none";
      }
    }
  }

  function renderEmergency(container, pageData) {
    const contacts = pageData.contacts || [];
    // Ensure Emergency Services first
    contacts.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    const primary =
      contacts.find((c) => /112|emergency|services/i.test(String(c.label))) ||
      contacts[0];

    let html = '<div class="emergency-grid">';
    if (primary) {
      const num = escapeHtml(primary.value || primary.phone || "");
      html += `<a class="emergency-btn emergency-primary" href="tel:${num}">Call ${escapeHtml(primary.label || "Emergency")} — ${num}</a>`;
    }
    html += '<div class="emergency-row">';
    contacts.forEach((c) => {
      if (c === primary) return;
      const num = escapeHtml(c.value || c.phone || "");
      html += `<a class="emergency-btn emergency-small" href="tel:${num}">Call ${escapeHtml(c.label || "Contact")} — ${num}</a>`;
    });
    html += "</div></div>";
    container.innerHTML = html;
  }

  function renderSimpleSections(data) {
    if (!data) return '<p class="muted">No content</p>';
    let html = "";
    Object.keys(data).forEach((k) => {
      if (k === "title") return;
      const v = data[k];
      if (Array.isArray(v))
        html += `<div class="section"><h3>${escapeHtml(k)}</h3><ul>${v.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul></div>`;
      else
        html += `<div class="section"><h3>${escapeHtml(k)}</h3><p>${escapeHtml(v)}</p></div>`;
    });
    return html;
  }

  async function renderNeighborhood(container, pageData, siteContent) {
    const p = pageData || {};
    const property = getCurrentProperty();
    const lang = getLang();

    // Load shops data
    let shopsData = {};
    try {
      const shopsUrl1 = SITE_ROOT + "data/property/neighborhood.json";
      const shopsUrl2 =
        SITE_ROOT + "data/properties/" + property + "/neighborhood.json";
      shopsData =
        (await fetchJson(shopsUrl1)) || (await fetchJson(shopsUrl2)) || {};
    } catch (e) {
      console.warn("Could not load shops data:", e);
    }

    let html = "";
    const items = [
      { key: "supermarket", emoji: "🛒", shopsKey: "supermarkets" },
      { key: "pharmacy", emoji: "💊", shopsKey: "pharmacies" },
      { key: "atm", emoji: "🏧", shopsKey: "atms" },
      { key: "cafes", emoji: "☕", shopsKey: "cafes" },
      { key: "bakery", emoji: "🥖", shopsKey: "bakeries" },
      { key: "gas", emoji: "⛽", shopsKey: "gas_stations" },
    ];

    items.forEach((it) => {
      const node = p[it.key] || {};
      const shops = shopsData[it.shopsKey] || [];

      html += `<div class="section"><h3>${it.emoji} ${escapeHtml(node.title || "")}</h3><p class="muted">${escapeHtml(node.text || "")}</p>`;

      if (shops.length > 0) {
        html += '<div class="shop-buttons">';
        shops.forEach((shop) => {
          const name = lang === "gr" ? shop.name_gr : shop.name_en;
          const mapsUrl = shop.maps;
          html += `<a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer" class="shop-btn">📍 ${escapeHtml(name)}</a>`;
        });
        html += "</div>";
      }

      html += "</div>";
    });
    container.innerHTML = html;
  }

  function getLocalizedValue(item, key, lang) {
    if (!item) return "";
    if (lang === "gr") return item[key + "_gr"] || item[key] || "";
    return item[key] || item[key + "_gr"] || "";
  }

  function getLocalizedArray(item, key, lang) {
    const value = getLocalizedValue(item, key, lang);
    return Array.isArray(value) ? value : [];
  }

  function renderWifi(container, data, siteContent) {
    const ssid = escapeHtml(data.ssid || "");
    const password = escapeHtml(data.password || "");
    const notes = escapeHtml(data.notes || "");
    const copyLabel =
      (siteContent && siteContent.ui && siteContent.ui.copyPassword) ||
      "Copy password";

    // prefer explicit qrImage in content, fallback to property-specific image (single-property layout)
    const propertyId =
      (CURRENT_PROPERTY_META && CURRENT_PROPERTY_META.id) ||
      getCurrentProperty();
    const defaultQr =
      SITE_ROOT + "data/property/images/" + propertyId + "-wifi.png";
    const qrSrc = data.qrImage ? SITE_ROOT + data.qrImage : defaultQr;

    const pageTitle =
      (siteContent &&
        siteContent.pages &&
        siteContent.pages.wifi &&
        siteContent.pages.wifi.title) ||
      (siteContent && siteContent.ui && siteContent.ui.wifiLabel) ||
      "Wi-Fi";

    // Collapsible section (match other page sections)
    container.innerHTML = `
      <details class="section wifi-section" open>
        <summary><strong>📶 ${escapeHtml(pageTitle)}</strong></summary>
        <div class="section-body">
          <div class="wifi-card">
            <div class="wifi-info">
              <label>Network (SSID)</label>
              <div class="muted">${ssid}</div>
              <label>Password</label>
              <div class="wifi-password">
                <span class="muted" id="wifi-pass">${password}</span>
                <button id="copy-pass" class="btn">${escapeHtml(copyLabel)}</button>
              </div>
              ${notes ? `<div class="notes"><strong>Notes</strong><p class="muted">${notes}</p></div>` : ""}
            </div>
            <div class="wifi-qr" data-qr-src="${qrSrc}"></div>
          </div>
        </div>
      </details>`;

    const copyBtn = container.querySelector("#copy-pass");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        copyToClipboard(data.password || "")
          .then(() => {
            const copiedLabel =
              (siteContent && siteContent.ui && siteContent.ui.copied) ||
              "Copied";
            copyBtn.textContent = copiedLabel;
            setTimeout(() => (copyBtn.textContent = copyLabel), 1500);
          })
          .catch(() => {
            alert("Copy failed");
          });
      });
    }

    // Load QR image only if it exists (keeps UI clean if missing)
    const qrDiv = container.querySelector(".wifi-qr");
    if (qrDiv) {
      const srcToTry = qrDiv.getAttribute("data-qr-src");
      if (srcToTry) {
        const img = new Image();
        img.alt =
          (siteContent && siteContent.ui && siteContent.ui.wifiQrAlt) ||
          "WiFi QR code";
        img.className = "wifi-qr-image";
        img.onload = () => {
          qrDiv.innerHTML = "";
          qrDiv.appendChild(img);
        };
        img.onerror = () => {
          qrDiv.style.display = "none";
        };
        img.src = srcToTry;
      } else {
        qrDiv.style.display = "none";
      }
    }
  }

  function copyToClipboard(text) {
    if (!text) return Promise.reject();
    if (navigator.clipboard && navigator.clipboard.writeText)
      return navigator.clipboard.writeText(text);
    return new Promise((resolve, reject) => {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        resolve();
      } catch (e) {
        reject(e);
      }
      ta.remove();
    });
  }

  function renderContacts(container, data, siteContent) {
    // expose UI labels for use in this function
    window.siteUi = (siteContent && siteContent.ui) || {};
    const c = data || {};
    const host = (CURRENT_PROPERTY_META && CURRENT_PROPERTY_META.host) || {};
    const lang = getLang();
    const propertyId = getCurrentProperty();
    const phoneRaw = String(c.phone || host.phone || "");
    const digits = phoneRaw.replace(/[^0-9]/g, "");
    const waNumber = digits.replace(/^00/, "");
    const viberNumber = "+" + digits.replace(/^00/, "");
    const messengerValue = c.messenger || host.messenger || "";
    const messengerPath =
      messengerValue &&
      (messengerValue.indexOf("m.me") > -1 ||
        messengerValue.indexOf("http") === 0)
        ? messengerValue
        : messengerValue
          ? `https://m.me/${messengerValue.replace(/^@/, "")}`
          : null;

    const labels = window.siteUi || {};
    const phoneLabel = labels.phoneLabel || "Phone";
    const whatsappLabel = labels.whatsappLabel || "WhatsApp";
    const messengerLabel = labels.messengerLabel || "Messenger";
    const viberLabel = labels.viberLabel || "Viber";
    const callText = labels.callAction || "Call";
    const openWhatsAppText = labels.openWhatsApp || "Open WhatsApp";
    const openMessengerText = labels.openMessenger || "Open Messenger";
    const openViberText = labels.openViber || "Open Viber";
    const rateStayTitle = labels.rateStayTitle || "Rate your stay";
    const rateStaySubtitle =
      labels.rateStaySubtitle || "Leave a review on Google";
    const rateStayAction = labels.rateStayAction || "Open Google";
    const suggestTitle =
      labels.suggestImprovementsTitle || "Suggest improvements";
    const suggestSubtitle =
      labels.suggestImprovementsSubtitle || "Share your ideas directly with us";
    const suggestAction = labels.suggestImprovementsAction || "Open form";
    const suggestionModalTitle = labels.suggestionModalTitle || suggestTitle;
    const suggestionTextareaLabel =
      labels.suggestionTextareaLabel || suggestTitle;
    const suggestionPlaceholder =
      labels.suggestionPlaceholder || "Write your suggestion here...";
    const suggestionSubmit = labels.suggestionSubmit || "Submit";
    const suggestionSending = labels.suggestionSending || "Sending...";
    const suggestionSuccess =
      labels.suggestionSuccess || "Thank you for your suggestion";
    const suggestionError =
      labels.suggestionError ||
      "Unable to send right now. Please try again later.";
    const suggestionClose = labels.suggestionClose || "Close";
    const reviewUrl =
      (CURRENT_PROPERTY_META && CURRENT_PROPERTY_META.rateUsUrl) ||
      c.reviewUrl ||
      "https://maps.google.com/?q=REPLACE_ME_REVIEW_URL";
    const suggestionEndpoint =
      c.suggestionEndpoint || "https://formspree.io/f/meeronor";

    const phoneHref = phoneRaw ? `tel:${phoneRaw}` : null;
    const waHref = waNumber ? `https://wa.me/${waNumber}` : null;
    const viberHref = viberNumber
      ? `viber://chat?number=${encodeURIComponent(viberNumber)}`
      : null;

    const html = `
      <div class="contact-panel">
        
        <div class="contact-card">
          <div class="contact-icon contact-icon-action" aria-hidden="true"><i class="fa-solid fa-phone"></i></div>
          <div class="contact-body">
            <div><strong>${escapeHtml(phoneLabel)}</strong></div>
            <div class="contact-copy">${escapeHtml(phoneRaw)}</div>
          </div>
          <div class="contact-actions">
            ${phoneHref ? `<a class="btn" href="${phoneHref}">${escapeHtml(callText)}</a>` : ""}
          </div>
        </div>

        <div class="contact-card">
          <div class="contact-icon contact-icon-whatsapp" aria-hidden="true">
            <i class="fa-brands fa-whatsapp"></i>
          </div>
          <div class="contact-body">
            <div><strong>${escapeHtml(whatsappLabel)}</strong></div>
            <div class="contact-copy">${escapeHtml(phoneRaw)}</div>
          </div>
          <div class="contact-actions">
            ${waHref ? `<a class="btn" href="${waHref}" target="_blank" rel="noopener">${escapeHtml(openWhatsAppText)}</a>` : ""}
          </div>
        </div>

        <div class="contact-card">
          <div class="contact-icon contact-icon-messenger" aria-hidden="true">
            <i class="fa-brands fa-facebook-messenger"></i>
          </div>
          <div class="contact-body">
            <div><strong>${escapeHtml(messengerLabel)}</strong></div>
            <div class="contact-copy">${escapeHtml(messengerValue)}</div>
          </div>
          <div class="contact-actions">
            ${messengerPath ? `<a class="btn" href="${messengerPath}" target="_blank" rel="noopener">${escapeHtml(openMessengerText)}</a>` : ""}
          </div>
        </div>

        <div class="contact-card">
          <div class="contact-icon contact-icon-viber" aria-hidden="true">
            <i class="fa-brands fa-viber"></i>
          </div>
          <div class="contact-body">
            <div><strong>${escapeHtml(viberLabel)}</strong></div>
            <div class="contact-copy">${escapeHtml(phoneRaw)}</div>
          </div>
          <div class="contact-actions">
            ${viberHref ? `<a class="btn" href="${viberHref}">${escapeHtml(openViberText)}</a>` : ""}
          </div>
        </div>
        <a> </a><a> </a><a> </a><a> </a>
        <div class="contact-card contact-card-action">
          <div class="contact-icon contact-icon-action" aria-hidden="true">⭐</div>
          <div class="contact-body">
            <div><strong>${escapeHtml(rateStayTitle)}</strong></div>
            <div class="contact-copy muted">${escapeHtml(rateStaySubtitle)}</div>
          </div>
          <div class="contact-actions">
            <a class="btn" href="${escapeHtml(reviewUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(rateStayAction)}</a>
          </div>
        </div>

        <div class="contact-card contact-card-action">
          <div class="contact-icon contact-icon-action" aria-hidden="true">💡</div>
          <div class="contact-body">
            <div><strong>${escapeHtml(suggestTitle)}</strong></div>
            <div class="contact-copy muted">${escapeHtml(suggestSubtitle)}</div>
          </div>
          <div class="contact-actions">
            <button type="button" class="btn" data-open-suggestion-modal>${escapeHtml(suggestAction)}</button>
          </div>
        </div>
      </div>

      <div class="contact-modal" id="suggestion-modal" hidden aria-hidden="true">
        <div class="contact-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="suggestion-modal-title">
          <div class="contact-modal-header">
            <div>
              <h2 id="suggestion-modal-title">${escapeHtml(suggestionModalTitle)}</h2>
              <p class="muted">${escapeHtml(suggestSubtitle)}</p>
            </div>
            <button type="button" class="contact-modal-close" aria-label="${escapeHtml(suggestionClose)}" data-close-suggestion-modal>×</button>
          </div>
          <form class="contact-form" action="${escapeHtml(suggestionEndpoint)}" method="POST" novalidate>
            <input type="hidden" name="propertyId" value="${escapeHtml(propertyId)}">
            <input type="hidden" name="propertyName" value="${escapeHtml((siteContent.site && siteContent.site.apartmentName) || "")}">
            <div class="contact-form-fields">
              <label class="sr-only" for="suggestion-message">${escapeHtml(suggestionTextareaLabel)}</label>
              <textarea id="suggestion-message" name="message" placeholder="${escapeHtml(suggestionPlaceholder)}" required></textarea>
            </div>
            <div class="contact-form-footer">
              <button type="submit" class="btn btn-primary">${escapeHtml(suggestionSubmit)}</button>
            </div>
            <p class="contact-form-status" data-form-status aria-live="polite"></p>
          </form>
        </div>
      </div>`;

    container.innerHTML = html;

    const modal = container.querySelector("#suggestion-modal");
    const openModalBtn = container.querySelector(
      "[data-open-suggestion-modal]",
    );
    const closeModalBtn =
      modal && modal.querySelector("[data-close-suggestion-modal]");
    const form = modal && modal.querySelector(".contact-form");
    const textarea = form && form.querySelector("#suggestion-message");
    const status = form && form.querySelector("[data-form-status]");
    const submitButton = form && form.querySelector('button[type="submit"]');
    let lastFocusedElement = null;

    function getFocusableElements() {
      if (!modal) return [];
      return Array.from(
        modal.querySelectorAll(
          'button, [href], textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.disabled && !el.hidden);
    }

    function openModal() {
      if (!modal || !textarea) return;
      lastFocusedElement = document.activeElement;
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      textarea.focus();
    }

    function closeModal() {
      if (!modal) return;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
      if (status) {
        status.textContent = "";
        status.className = "contact-form-status";
      }
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = suggestionSubmit;
      }
      if (lastFocusedElement && typeof lastFocusedElement.focus === "function")
        lastFocusedElement.focus();
    }

    if (openModalBtn) openModalBtn.addEventListener("click", openModal);
    if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
    if (modal) {
      modal.addEventListener("click", (ev) => {
        if (ev.target === modal) closeModal();
      });
      modal.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          closeModal();
          return;
        }
        if (ev.key !== "Tab") return;
        const focusable = getFocusableElements();
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (ev.shiftKey && document.activeElement === first) {
          ev.preventDefault();
          last.focus();
        } else if (!ev.shiftKey && document.activeElement === last) {
          ev.preventDefault();
          first.focus();
        }
      });
    }

    Array.from(container.querySelectorAll(".contact-card")).forEach((card) => {
      const actionLink = card.querySelector(".contact-actions a");
      const actionButton = card.querySelector(".contact-actions button");
      if (!actionLink && !actionButton) return;

      card.tabIndex = 0;
      card.addEventListener("click", (ev) => {
        if (ev.target.closest(".btn")) return;
        if (actionLink) actionLink.click();
        else if (actionButton) actionButton.click();
      });
      card.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        ev.preventDefault();
        if (actionLink) actionLink.click();
        else if (actionButton) actionButton.click();
      });
    });

    if (form) {
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        if (!textarea || !submitButton || !status) return;
        const message = textarea.value.trim();
        if (!message) {
          textarea.focus();
          return;
        }
        submitButton.disabled = true;
        submitButton.textContent = suggestionSending;
        status.textContent = "";
        status.className = "contact-form-status";

        try {
          const formData = new FormData(form);
          const response = await fetch(form.action, {
            method: "POST",
            body: formData,
            headers: { Accept: "application/json" },
          });
          if (!response.ok) throw new Error("Submission failed");
          form.reset();
          form.querySelector('input[name="propertyId"]').value = propertyId;
          closeModal();
          showToast(suggestionSuccess, "success");
        } catch (e) {
          status.textContent = suggestionError;
          status.className = "contact-form-status is-error";
        } finally {
          submitButton.disabled = false;
          submitButton.textContent = suggestionSubmit;
        }
      });
    }
  }

  // Generic dataset list renderer for restaurants/attractions
  async function renderDatasetList(
    container,
    type,
    datasetPath,
    pageData,
    siteContent,
  ) {
    // Prefer property-specific dataset when available
    const property = getCurrentProperty();
    let ds = null;
    if (datasetPath && datasetPath.startsWith("dataset/") && property) {
      const propDs1 = SITE_ROOT + "data/property/" + datasetPath;
      const propDs2 =
        SITE_ROOT + "data/properties/" + property + "/" + datasetPath;
      ds = (await fetchJson(propDs1)) || (await fetchJson(propDs2));
    }
    if (!ds) {
      const dsUrl = SITE_ROOT + datasetPath;
      ds = (await fetchJson(dsUrl)) || { items: [] };
    }
    const items = ds.items || [];
    const lang = getLang();
    const searchPlaceholder =
      (siteContent && siteContent.ui && siteContent.ui.searchPlaceholder) ||
      "Search";

    let distanceMatrix = {};
    if (type === "restaurants") {
      distanceMatrix = await loadRestaurantDistanceMatrix(property);
    } else if (type === "attractions") {
      distanceMatrix = await loadAttractionDistanceMatrix(property);
    }
    const propertyDistances = distanceMatrix;

    let controlsHtml = "";
    let filterCategories = [];
    if (type === "restaurants") {
      const categories = {
        All: "All",
        Restaurant: "Restaurants/Taverns",
        Cafe: "Cafes",
        Bar: "Bar/Clubs",
        Patisserie: "Patisseries",
      };
      filterCategories = ["All", "Restaurant", "Cafe", "Bar", "Patisserie"];
      controlsHtml = `
        <div class="beaches-controls">
          ${filterCategories.map((c) => `<button class="filter-btn" data-category="${c}">${categories[c]}</button>`).join("")}
          <input type="search" id="ds-search" placeholder="${escapeHtml(searchPlaceholder)}" aria-label="Search">
        </div>`;
    } else if (type === "attractions") {
      const categories = {
        All: "All",
        Nature: "Nature",
        Monasteries: "Monasteries",
        Landmarks: "Landmarks",
        History: "History",
        Museums: "Museums",
      };
      filterCategories = [
        "All",
        "Nature",
        "Monasteries",
        "Landmarks",
        "History",
        "Museums",
      ];
      controlsHtml = `
        <div class="beaches-controls">
          ${filterCategories.map((c) => `<button class="filter-btn" data-category="${c}">${categories[c]}</button>`).join("")}
          <input type="search" id="ds-search" placeholder="${escapeHtml(searchPlaceholder)}" aria-label="Search">
        </div>`;
    } else {
      controlsHtml = `
        <div class="list-controls">
          <input type="search" id="ds-search" placeholder="${escapeHtml(searchPlaceholder)}" aria-label="Search">
        </div>`;
    }

    container.innerHTML =
      controlsHtml + '<div id="ds-list" class="ds-list"></div>';

    const listEl = container.querySelector("#ds-list");
    const search = container.querySelector("#ds-search");

    let activeCategory = "All";

    if (type === "restaurants") {
      container.querySelectorAll(".filter-btn").forEach((b) =>
        b.addEventListener("click", () => {
          container
            .querySelectorAll(".filter-btn")
            .forEach((x) => x.classList.toggle("active", x === b));
          activeCategory = b.getAttribute("data-category");
          renderList(search ? search.value : "", activeCategory);
        }),
      );
      container
        .querySelector('.filter-btn[data-category="All"]')
        .classList.add("active");
    } else if (type === "attractions") {
      container.querySelectorAll(".filter-btn").forEach((b) =>
        b.addEventListener("click", () => {
          container
            .querySelectorAll(".filter-btn")
            .forEach((x) => x.classList.toggle("active", x === b));
          activeCategory = b.getAttribute("data-category");
          renderList(search ? search.value : "", activeCategory);
        }),
      );
      container
        .querySelector('.filter-btn[data-category="All"]')
        .classList.add("active");
    }

    function formatDistanceText(routeData) {
      if (!routeData) return "";
      const driveTimeMin = Math.round(Number(routeData.drive_time_min) / 5) * 5;
      const distanceKm = Math.round(Number(routeData.distance_km));
      const parts = [];
      if (Number.isFinite(driveTimeMin))
        parts.push(
          lang === "gr"
            ? `🚗 ~${driveTimeMin} λεπτά`
            : `🚗 ~${driveTimeMin} min`,
        );
      if (Number.isFinite(distanceKm)) {
        const locale = lang === "gr" ? "el-GR" : "en-GB";
        const unit = lang === "gr" ? "χλμ" : "km";
        parts.push(`${distanceKm.toLocaleString(locale)} ${unit}`);
      }
      return parts.length ? parts.join(" • ") : "";
    }

    function renderList(filter, category = "All") {
      const q = (filter || "").toLowerCase();
      listEl.innerHTML = items
        .filter((it) => {
          const okCategory =
            category === "All" ||
            (type === "attractions"
              ? it.type === category
              : it.type &&
                it.type.toLowerCase().includes(category.toLowerCase()));
          const localizedName = String(
            getLocalizedValue(it, "name", lang),
          ).toLowerCase();
          const localizedShort = String(
            getLocalizedValue(it, "short", lang),
          ).toLowerCase();
          const localizedArea = String(
            getLocalizedValue(it, "area", lang),
          ).toLowerCase();
          const okQuery =
            !q ||
            localizedName.includes(q) ||
            localizedShort.includes(q) ||
            localizedArea.includes(q);
          return okCategory && okQuery;
        })
        .map((it) => {
          // create a directions link (prefer destination by name/address) using apartment origin coords
          const origin = `${WEATHER_COORDS.lat},${WEATHER_COORDS.lon}`;
          const destQuery = encodeURIComponent(
            (it.name || "") + (it.area ? " " + it.area : ""),
          );
          const directions = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destQuery}&travelmode=driving`;
          const href = it.mapLink ? it.mapLink : directions;
          const localizedName = getLocalizedValue(it, "name", lang);
          const localizedArea = getLocalizedValue(it, "area", lang);
          const localizedShort = getLocalizedValue(it, "short", lang);
          const routeData = propertyDistances[it.id] || null;
          const timeText =
            type === "restaurants" || type === "attractions"
              ? formatDistanceText(routeData)
              : "";
          if (type === "restaurants") {
            return `
            <a class="ds-link restaurant-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
              <article class="restaurant-card">
                <div class="restaurant-media"><img src="${SITE_ROOT + (it.image || "dataset/images/placeholder.svg")}" alt="${escapeHtml(localizedName)}"><div class="restaurant-overlay"><h3>${escapeHtml(localizedName)}</h3></div></div>
                <div class="restaurant-body"><p class="muted">${escapeHtml(localizedArea || "")} ${it.price ? " • " + escapeHtml(it.price) : ""}</p><p>${escapeHtml(localizedShort || "")}</p>
                  ${timeText ? `<p class="muted time-estimate">${escapeHtml(timeText)}</p>` : ""}
                </div>
              </article>
            </a>`;
          } else if (type === "attractions") {
            return `
            <a class="ds-link attraction-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
              <article class="attraction-card">
                <div class="attraction-media"><img src="${SITE_ROOT + (it.image || "dataset/images/placeholder.svg")}" alt="${escapeHtml(localizedName)}"><div class="attraction-overlay"><h3>${escapeHtml(localizedName)}</h3></div></div>
                <div class="attraction-body"><p class="muted">${escapeHtml(localizedArea || "")}</p><p>${escapeHtml(localizedShort || "")}</p>
                  ${timeText ? `<p class="muted time-estimate">${escapeHtml(timeText)}</p>` : ""}
                </div>
              </article>
            </a>`;
          } else {
            return `
            <a class="ds-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
              <article class="ds-card">
                <img src="${SITE_ROOT + (it.image || "dataset/images/placeholder.svg")}" alt="${escapeHtml(localizedName)}">
                <div class="ds-body">
                  <h3>${escapeHtml(localizedName)}</h3>
                  <p class="muted">${escapeHtml(localizedArea || "")} ${it.price ? " • " + escapeHtml(it.price) : ""}</p>
                  <p>${escapeHtml(localizedShort || "")}</p>
                </div>
              </article>
            </a>`;
          }
        })
        .join("");
    }

    renderList();
    if (search)
      search.addEventListener("input", () =>
        renderList(search.value, activeCategory),
      );
  }

  // Beaches renderer with simple region filters
  async function renderBeaches(container, datasetPath, siteContent) {
    const dsUrl = SITE_ROOT + datasetPath;
    const ds = (await fetchJson(dsUrl)) || { items: [] };
    const propertyId = getCurrentProperty();
    const distanceMatrix = await loadBeachDistanceMatrix(propertyId);
    const items = ds.items || [];
    const lang = getLang();
    const propertyDistances = distanceMatrix[propertyId] || {};
    const regionLabels =
      lang === "gr"
        ? {
            All: "Όλες",
            "West Coast": "Δυτική Ακτή",
            "East Coast": "Ανατολική Ακτή",
            "South Coast": "Νότια Ακτή",
          }
        : {
            All: "All",
            "West Coast": "West Coast",
            "East Coast": "East Coast",
            "South Coast": "South Coast",
          };
    const regions = ["All", "West Coast", "East Coast", "South Coast"];
    const searchPlaceholder =
      siteContent && siteContent.ui && siteContent.ui.searchPlaceholder
        ? lang === "gr"
          ? siteContent.ui.searchPlaceholder + "..."
          : siteContent.ui.searchPlaceholder + "..."
        : lang === "gr"
          ? "Αναζήτηση"
          : "Search";
    container.innerHTML = `
      <div class="beaches-controls">
        ${regions.map((r) => `<button class="filter-btn" data-region="${r}">${regionLabels[r]}</button>`).join("")}
        <input type="search" id="beach-search" placeholder="${escapeHtml(searchPlaceholder)}">
      </div>
      <div id="beaches-grid" class="beaches-grid"></div>`;

    const grid = container.querySelector("#beaches-grid");
    const search = container.querySelector("#beach-search");
    container.querySelectorAll(".filter-btn").forEach((b) =>
      b.addEventListener("click", () => {
        container
          .querySelectorAll(".filter-btn")
          .forEach((x) => x.classList.toggle("active", x === b));
        renderBeachesGrid(b.getAttribute("data-region"), search.value);
      }),
    );

    search.addEventListener("input", () => {
      const active =
        container
          .querySelector(".filter-btn.active")
          ?.getAttribute("data-region") || "All";
      renderBeachesGrid(active, search.value);
    });

    function formatBeachRouteText(routeData) {
      if (!routeData)
        return lang === "gr"
          ? "Η απόσταση δεν είναι διαθέσιμη"
          : "Distance unavailable";
      const driveTimeMin = Math.round(Number(routeData.drive_time_min) / 5) * 5;
      const distanceKm = Math.round(Number(routeData.distance_km));
      const parts = [];
      if (Number.isFinite(driveTimeMin))
        parts.push(
          lang === "gr"
            ? `🚗 ~${driveTimeMin} λεπτά`
            : `🚗 ~${driveTimeMin} min`,
        );
      if (Number.isFinite(distanceKm)) {
        const locale = lang === "gr" ? "el-GR" : "en-GB";
        const unit = lang === "gr" ? "χλμ" : "km";
        parts.push(`${distanceKm.toLocaleString(locale)} ${unit}`);
      }
      return parts.length
        ? parts.join(" • ")
        : lang === "gr"
          ? "Η απόσταση δεν είναι διαθέσιμη"
          : "Distance unavailable";
    }

    function renderBeachesGrid(region, q) {
      const qq = (q || "").toLowerCase();
      const filtered = items.filter((it) => {
        const okRegion =
          region === "All" ||
          (it.region || "").toLowerCase().includes(region.toLowerCase());
        const localizedName = String(
          getLocalizedValue(it, "name", lang),
        ).toLowerCase();
        const localizedShort = String(
          getLocalizedValue(it, "short", lang),
        ).toLowerCase();
        const localizedArea = String(
          getLocalizedValue(it, "area", lang),
        ).toLowerCase();
        const okQuery =
          !qq ||
          localizedName.includes(qq) ||
          localizedShort.includes(qq) ||
          localizedArea.includes(qq);
        return okRegion && okQuery;
      });
      grid.innerHTML = filtered
        .map((it) => {
          const origin = `${WEATHER_COORDS.lat},${WEATHER_COORDS.lon}`;
          const beachCoords =
            it.coordinates &&
            Number.isFinite(Number(it.coordinates.lat)) &&
            Number.isFinite(Number(it.coordinates.lon))
              ? `${Number(it.coordinates.lat)},${Number(it.coordinates.lon)}`
              : null;
          const destQuery = encodeURIComponent(
            beachCoords || (it.name || "") + (it.area ? " " + it.area : ""),
          );
          const directions = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destQuery}&travelmode=driving`;
          const href = it.mapLink ? it.mapLink : directions;
          const localizedName = getLocalizedValue(it, "name", lang);
          const localizedArea = getLocalizedValue(it, "area", lang);
          const localizedShort = getLocalizedValue(it, "short", lang);
          const routeData = propertyDistances[it.id] || null;
          const timeText = formatBeachRouteText(routeData);
          return `
        <a class="ds-link beach-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
          <article class="beach-card">
            <div class="beach-media"><img src="${SITE_ROOT + (it.image || "dataset/images/placeholder.svg")}" alt="${escapeHtml(localizedName)}"><div class="beach-overlay"><h3>${escapeHtml(localizedName)}</h3></div></div>
            <div class="beach-body"><p class="muted">${escapeHtml(localizedArea || "")}</p><p>${escapeHtml(localizedShort || "")}</p>
              <p class="muted time-estimate">${escapeHtml(timeText)}</p>
            </div>
          </article>
        </a>`;
        })
        .join("");
    }

    // default
    container
      .querySelector('.filter-btn[data-region="All"]')
      .classList.add("active");
    renderBeachesGrid("All", "");
  }

  function escapeHtml(s) {
    if (!s) return "";
    return String(s).replace(
      /[&<>"]+/g,
      (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] || c,
    );
  }

  // attach handlers for language buttons
  function attachLangButtons() {
    document.querySelectorAll(".lang-btn").forEach((b) => {
      b.addEventListener("click", () => {
        const lang = b.getAttribute("data-lang");
        setLang(lang);
      });
    });
  }

  // Simple swipe-right to go back gesture for touch devices
  (function attachSwipeBack() {
    let startX = 0,
      startY = 0,
      tracking = false;
    document.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1) return; // only single touch
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        tracking = true;
      },
      { passive: true },
    );
    document.addEventListener(
      "touchmove",
      (e) => {
        if (!tracking) return;
      },
      { passive: true },
    );
    document.addEventListener(
      "touchend",
      (e) => {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches && e.changedTouches[0];
        if (!t) return;
        const dx = t.clientX - startX;
        const dy = Math.abs(t.clientY - startY || 0);
        if (dx > 60 && dy < 50) {
          // avoid triggering when focus is on input or when starting from inside interactive controls
          const active = document.activeElement;
          if (
            active &&
            (active.tagName === "INPUT" ||
              active.tagName === "TEXTAREA" ||
              active.isContentEditable)
          )
            return;
          try {
            history.back();
          } catch (e) {}
        }
      },
      { passive: true },
    );
  })();

  // WEATHER: fetch Open-Meteo for Lefkada and render 7-day forecast
  const WEATHER_COORDS = {
    lat: 38.831791,
    lon: 20.696838,
    tz: "Europe/Athens",
  };
  // expose cache on window so setLang can re-render without refetch
  window.weatherCache = null;
  const weatherCodeMap = {
    0: ["clear sky", "Καθαρός ουρανός"],
    1: ["mainly clear", "Καθαρός σε μεγάλο βαθμό"],
    2: ["partly cloudy", "Μερικώς συννεφιασμένος"],
    3: ["overcast", "Συννεφιά"],
    45: ["fog", "Ομίχλη"],
    48: ["depositing rime fog", "Πάχνη"],
    51: ["light drizzle", "Λεπτή βροχούλα"],
    53: ["moderate drizzle", "Μέτρια βροχούλα"],
    55: ["dense drizzle", "Πυκνή βροχούλα"],
    61: ["slight rain", "Βροχή"],
    63: ["moderate rain", "Μέτρια βροχή"],
    65: ["heavy rain", "Έντονη βροχή"],
    71: ["light snow", "Χιόνι"],
    73: ["moderate snow", "Μέτριο χιόνι"],
    75: ["heavy snow", "Έντονο χιόνι"],
    95: ["thunderstorm", "Καταιγίδα"],
  };

  function weatherIconSVG(code, size = 64) {
    const w = size;
    const h = size;

    const sun = `
    <svg class="icon weather-icon weather-icon-sun" width="${w}" height="${h}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
        <radialGradient id="sun-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#FFF7C2"/>
            <stop offset="55%" stop-color="#FFD76A"/>
            <stop offset="100%" stop-color="#FFB347"/>
        </radialGradient>
        <filter id="sun-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.2" result="blur"/>
            <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
            </feMerge>
        </filter>
        </defs>

        <g filter="url(#sun-glow)">
        <circle cx="32" cy="32" r="12" fill="url(#sun-core)"/>
        </g>

        <g stroke="#FFC857" stroke-width="3" stroke-linecap="round" opacity="0.95">
        <line x1="32" y1="7"  x2="32" y2="16"/>
        <line x1="32" y1="48" x2="32" y2="57"/>
        <line x1="7"  y1="32" x2="16" y2="32"/>
        <line x1="48" y1="32" x2="57" y2="32"/>
        <line x1="13.5" y1="13.5" x2="19.5" y2="19.5"/>
        <line x1="44.5" y1="44.5" x2="50.5" y2="50.5"/>
        <line x1="44.5" y1="19.5" x2="50.5" y2="13.5"/>
        <line x1="13.5" y1="50.5" x2="19.5" y2="44.5"/>
        </g>
    </svg>`;

    const cloud = `
    <svg class="icon weather-icon weather-icon-cloud" width="${w}" height="${h}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
        <linearGradient id="cloud-grad" x1="0" x2="1">
            <stop offset="0%" stop-color="#F8FAFC"/>
            <stop offset="100%" stop-color="#D5DDE8"/>
        </linearGradient>
        <filter id="cloud-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#5B6B82" flood-opacity="0.18"/>
        </filter>
        </defs>

        <g filter="url(#cloud-shadow)">
        <ellipse cx="24" cy="37" rx="12" ry="8.5" fill="url(#cloud-grad)"/>
        <ellipse cx="37" cy="35.5" rx="11.5" ry="8.2" fill="url(#cloud-grad)"/>
        <ellipse cx="31" cy="30.5" rx="13" ry="10" fill="url(#cloud-grad)"/>
        <rect x="16" y="34" width="29" height="11" rx="5.5" fill="url(#cloud-grad)"/>
        </g>
    </svg>`;

    const partlyCloudy = `
    <svg class="icon weather-icon weather-icon-partly" width="${w}" height="${h}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
        <radialGradient id="pc-sun-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#FFF7C2"/>
            <stop offset="55%" stop-color="#FFD76A"/>
            <stop offset="100%" stop-color="#FFB347"/>
        </radialGradient>
        <linearGradient id="pc-cloud-grad" x1="0" x2="1">
            <stop offset="0%" stop-color="#F8FAFC"/>
            <stop offset="100%" stop-color="#D5DDE8"/>
        </linearGradient>
        <filter id="pc-sun-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.6" result="blur"/>
            <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
            </feMerge>
        </filter>
        <filter id="pc-cloud-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#5B6B82" flood-opacity="0.18"/>
        </filter>
        </defs>

        <g opacity="0.95">
        <g filter="url(#pc-sun-glow)">
            <circle cx="23" cy="22" r="10" fill="url(#pc-sun-core)"/>
        </g>
        <g stroke="#FFC857" stroke-width="2.4" stroke-linecap="round" opacity="0.95">
            <line x1="23" y1="7.5"  x2="23" y2="13"/>
            <line x1="23" y1="31"   x2="23" y2="36.5"/>
            <line x1="8.5" y1="22"  x2="14" y2="22"/>
            <line x1="32"  y1="22"  x2="37.5" y2="22"/>
            <line x1="13" y1="12"   x2="17" y2="16"/>
            <line x1="29" y1="28"   x2="33" y2="32"/>
            <line x1="29" y1="16"   x2="33" y2="12"/>
            <line x1="13" y1="32"   x2="17" y2="28"/>
        </g>
        </g>

        <g filter="url(#pc-cloud-shadow)">
        <ellipse cx="29" cy="39" rx="12" ry="8.5" fill="url(#pc-cloud-grad)"/>
        <ellipse cx="42" cy="37.5" rx="11.5" ry="8.2" fill="url(#pc-cloud-grad)"/>
        <ellipse cx="36" cy="32.5" rx="13" ry="10" fill="url(#pc-cloud-grad)"/>
        <rect x="21" y="36" width="29" height="11" rx="5.5" fill="url(#pc-cloud-grad)"/>
        </g>
    </svg>`;

    const rain = `
    <svg class="icon weather-icon weather-icon-rain" width="${w}" height="${h}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
        <linearGradient id="rain-cloud-grad" x1="0" x2="1">
            <stop offset="0%" stop-color="#F8FAFC"/>
            <stop offset="100%" stop-color="#D5DDE8"/>
        </linearGradient>
        <linearGradient id="rain-drop-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#7EC8FF"/>
            <stop offset="100%" stop-color="#3A9EEB"/>
        </linearGradient>
        <filter id="rain-cloud-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#5B6B82" flood-opacity="0.18"/>
        </filter>
        </defs>

        <g filter="url(#rain-cloud-shadow)">
        <ellipse cx="24" cy="31" rx="12" ry="8.5" fill="url(#rain-cloud-grad)"/>
        <ellipse cx="37" cy="29.5" rx="11.5" ry="8.2" fill="url(#rain-cloud-grad)"/>
        <ellipse cx="31" cy="24.5" rx="13" ry="10" fill="url(#rain-cloud-grad)"/>
        <rect x="16" y="28" width="29" height="11" rx="5.5" fill="url(#rain-cloud-grad)"/>
        </g>

        <g stroke="url(#rain-drop-grad)" stroke-width="3.3" stroke-linecap="round" fill="none" opacity="0.96">
        <line x1="22" y1="42" x2="18" y2="51">
            <animate attributeName="opacity" values="0.25;1;0.25" dur="1.25s" repeatCount="indefinite"/>
        </line>
        <line x1="32" y1="44" x2="28" y2="53">
            <animate attributeName="opacity" values="1;0.25;1" dur="1.1s" repeatCount="indefinite"/>
        </line>
        <line x1="42" y1="42" x2="38" y2="51">
            <animate attributeName="opacity" values="0.45;1;0.45" dur="1.35s" repeatCount="indefinite"/>
        </line>
        </g>
    </svg>`;

    const showers = `
    <svg class="icon weather-icon weather-icon-showers" width="${w}" height="${h}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
        <radialGradient id="sh-sun-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#FFF7C2"/>
            <stop offset="55%" stop-color="#FFD76A"/>
            <stop offset="100%" stop-color="#FFB347"/>
        </radialGradient>
        <linearGradient id="sh-cloud-grad" x1="0" x2="1">
            <stop offset="0%" stop-color="#F8FAFC"/>
            <stop offset="100%" stop-color="#D5DDE8"/>
        </linearGradient>
        <linearGradient id="sh-drop-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#7EC8FF"/>
            <stop offset="100%" stop-color="#3A9EEB"/>
        </linearGradient>
        <filter id="sh-sun-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.4" result="blur"/>
            <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
            </feMerge>
        </filter>
        <filter id="sh-cloud-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#5B6B82" flood-opacity="0.18"/>
        </filter>
        </defs>

        <g filter="url(#sh-sun-glow)">
        <circle cx="21" cy="20" r="8.5" fill="url(#sh-sun-core)"/>
        </g>

        <g filter="url(#sh-cloud-shadow)">
        <ellipse cx="27" cy="32" rx="12" ry="8.5" fill="url(#sh-cloud-grad)"/>
        <ellipse cx="40" cy="30.5" rx="11.5" ry="8.2" fill="url(#sh-cloud-grad)"/>
        <ellipse cx="34" cy="25.5" rx="13" ry="10" fill="url(#sh-cloud-grad)"/>
        <rect x="19" y="29" width="29" height="11" rx="5.5" fill="url(#sh-cloud-grad)"/>
        </g>

        <g stroke="url(#sh-drop-grad)" stroke-width="3.2" stroke-linecap="round" fill="none" opacity="0.96">
        <line x1="28" y1="43" x2="24" y2="51">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" repeatCount="indefinite"/>
        </line>
        <line x1="39" y1="44" x2="35" y2="52">
            <animate attributeName="opacity" values="1;0.35;1" dur="1.1s" repeatCount="indefinite"/>
        </line>
        </g>
    </svg>`;

    const storm = `
    <svg class="icon weather-icon weather-icon-storm" width="${w}" height="${h}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
        <linearGradient id="storm-cloud-grad" x1="0" x2="1">
            <stop offset="0%" stop-color="#EEF2F7"/>
            <stop offset="100%" stop-color="#C8D1DC"/>
        </linearGradient>
        <linearGradient id="storm-bolt-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#FFE38A"/>
            <stop offset="100%" stop-color="#FFB347"/>
        </linearGradient>
        <linearGradient id="storm-drop-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#7EC8FF"/>
            <stop offset="100%" stop-color="#3A9EEB"/>
        </linearGradient>
        <filter id="storm-cloud-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#46566E" flood-opacity="0.22"/>
        </filter>
        </defs>

        <g filter="url(#storm-cloud-shadow)">
        <ellipse cx="24" cy="29" rx="12" ry="8.5" fill="url(#storm-cloud-grad)"/>
        <ellipse cx="37" cy="27.5" rx="11.5" ry="8.2" fill="url(#storm-cloud-grad)"/>
        <ellipse cx="31" cy="22.5" rx="13" ry="10" fill="url(#storm-cloud-grad)"/>
        <rect x="16" y="26" width="29" height="11" rx="5.5" fill="url(#storm-cloud-grad)"/>
        </g>

        <polygon points="31,37 25,49 33,49 28,60 42,44 34,44 39,37" fill="url(#storm-bolt-grad)"/>

        <g stroke="url(#storm-drop-grad)" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.95">
        <line x1="20" y1="41" x2="17" y2="48"/>
        <line x1="45" y1="41" x2="42" y2="48"/>
        </g>
    </svg>`;

    const fog = `
    <svg class="icon weather-icon weather-icon-fog" width="${w}" height="${h}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
        <linearGradient id="fog-cloud-grad" x1="0" x2="1">
            <stop offset="0%" stop-color="#F7F9FC"/>
            <stop offset="100%" stop-color="#DCE3EC"/>
        </linearGradient>
        </defs>

        <g opacity="0.95">
        <ellipse cx="24" cy="26" rx="12" ry="8.5" fill="url(#fog-cloud-grad)"/>
        <ellipse cx="37" cy="24.5" rx="11.5" ry="8.2" fill="url(#fog-cloud-grad)"/>
        <ellipse cx="31" cy="19.5" rx="13" ry="10" fill="url(#fog-cloud-grad)"/>
        <rect x="16" y="23" width="29" height="11" rx="5.5" fill="url(#fog-cloud-grad)"/>
        </g>

        <g stroke="#B8C4D1" stroke-width="3" stroke-linecap="round" opacity="0.9">
        <line x1="12" y1="40" x2="52" y2="40"/>
        <line x1="16" y1="47" x2="48" y2="47"/>
        <line x1="20" y1="54" x2="44" y2="54"/>
        </g>
    </svg>`;

    const snow = `
    <svg class="icon weather-icon weather-icon-snow" width="${w}" height="${h}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
        <linearGradient id="snow-cloud-grad" x1="0" x2="1">
            <stop offset="0%" stop-color="#F8FAFC"/>
            <stop offset="100%" stop-color="#D5DDE8"/>
        </linearGradient>
        <filter id="snow-cloud-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#5B6B82" flood-opacity="0.18"/>
        </filter>
        </defs>

        <g filter="url(#snow-cloud-shadow)">
        <ellipse cx="24" cy="29" rx="12" ry="8.5" fill="url(#snow-cloud-grad)"/>
        <ellipse cx="37" cy="27.5" rx="11.5" ry="8.2" fill="url(#snow-cloud-grad)"/>
        <ellipse cx="31" cy="22.5" rx="13" ry="10" fill="url(#snow-cloud-grad)"/>
        <rect x="16" y="26" width="29" height="11" rx="5.5" fill="url(#snow-cloud-grad)"/>
        </g>

        <g stroke="#87CFFF" stroke-width="2.2" stroke-linecap="round" opacity="0.95">
        <g transform="translate(21 46)">
            <line x1="-3" y1="0" x2="3" y2="0"/>
            <line x1="0" y1="-3" x2="0" y2="3"/>
            <line x1="-2.2" y1="-2.2" x2="2.2" y2="2.2"/>
            <line x1="-2.2" y1="2.2" x2="2.2" y2="-2.2"/>
        </g>
        <g transform="translate(32 50)">
            <line x1="-3" y1="0" x2="3" y2="0"/>
            <line x1="0" y1="-3" x2="0" y2="3"/>
            <line x1="-2.2" y1="-2.2" x2="2.2" y2="2.2"/>
            <line x1="-2.2" y1="2.2" x2="2.2" y2="-2.2"/>
        </g>
        <g transform="translate(43 46)">
            <line x1="-3" y1="0" x2="3" y2="0"/>
            <line x1="0" y1="-3" x2="0" y2="3"/>
            <line x1="-2.2" y1="-2.2" x2="2.2" y2="2.2"/>
            <line x1="-2.2" y1="2.2" x2="2.2" y2="-2.2"/>
        </g>
        </g>
    </svg>`;

    // Open-Meteo / WMO-style code mapping
    if (code === 0 || code === 1) return sun;
    if (code === 2) return partlyCloudy;
    if (code === 3) return cloud;
    if ([45, 48].includes(code)) return fog;
    if ([51, 53, 55, 56, 57].includes(code)) return showers;
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return rain;
    if ([71, 73, 75, 77, 85, 86].includes(code)) return snow;
    if ([95, 96, 99].includes(code)) return storm;
    // fallback
    return sun;
  }

  async function initWeather() {
    const elRoot = document.getElementById("weather-section");
    if (!elRoot) return;
    // try to load cached weather from sessionStorage
    try {
      const cached = sessionStorage.getItem("weatherCache");
      if (cached) {
        window.weatherCache = JSON.parse(cached);
        renderWeather(window.weatherCache, getLang());
        return;
      }
    } catch (e) {
      /* ignore parse errors */
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_COORDS.lat}&longitude=${WEATHER_COORDS.lon}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=${encodeURIComponent(WEATHER_COORDS.tz)}&forecast_days=7`;
    const w = await fetchJson(url);
    if (!w) {
      elRoot.innerHTML = '<p class="muted">Weather unavailable right now.</p>';
      return;
    }
    // cache and render
    window.weatherCache = w;
    try {
      sessionStorage.setItem("weatherCache", JSON.stringify(w));
    } catch (e) {}
    renderWeather(window.weatherCache, getLang());
  }

  // render from cached weather response; safe to call on language switch
  function renderWeather(w, lang) {
    if (!w) return;
    try {
      const curr = w.current || {};
      const daily = w.daily || {};
      const days = (daily.time || []).map((d, i) => ({
        date: d,
        code: (daily.weather_code && daily.weather_code[i]) || 0,
        max: (daily.temperature_2m_max && daily.temperature_2m_max[i]) || null,
        min: (daily.temperature_2m_min && daily.temperature_2m_min[i]) || null,
      }));

      const locEl = document.getElementById("weather-location");
      const iconEl = document.getElementById("weather-current-icon");
      const tempEl = document.getElementById("weather-current-temp");
      const descEl = document.getElementById("weather-desc");
      if (locEl) locEl.textContent = getWeatherLocationName(lang);
      if (iconEl) {
        iconEl.innerHTML = weatherIconSVG(curr.weather_code || 0, 64);
        const svg = iconEl.querySelector("svg");
        if (svg) {
          svg.setAttribute("width", "100%");
          svg.setAttribute("height", "100%");
        }
      }
      if (tempEl) tempEl.textContent = `${Math.round(curr.temperature_2m)}°C`;
      if (descEl)
        descEl.textContent = getWeatherDescription(curr.weather_code, lang);

      const row = document.getElementById("forecast-row");
      if (row) {
        row.innerHTML = days
          .map((d) => {
            const dt = new Date(d.date + "T12:00:00");
            const weekday = getWeatherDayLabel(dt, lang);
            const icon = weatherIconSVG(d.code, 32);
            return `<div class="forecast-item"><div class="day">${escapeHtml(weekday)}</div><div class="icon">${icon}</div><div class="temps">${d.max !== null ? Math.round(d.max) + "°" : "--"} / ${d.min !== null ? Math.round(d.min) + "°" : "--"}</div></div>`;
          })
          .join("");
      }
    } catch (e) {
      console.warn("renderWeather failed", e);
    }
  }

  function getWeatherDescription(code, lang) {
    if (code == null) return "";
    const pair = weatherCodeMap[code] || null;
    if (pair) return lang === "gr" ? pair[1] : pair[0];
    return "";
  }

  function getWeatherDayLabel(dateObj, lang) {
    try {
      return dateObj.toLocaleDateString(lang === "gr" ? "el-GR" : "en-GB", {
        weekday: "short",
      });
    } catch (e) {
      const daysEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const daysGr = ["Κυρ", "Δευ", "Τρι", "Τετ", "Πεμ", "Παρ", "Σαβ"];
      return (lang === "gr" ? daysGr : daysEn)[dateObj.getDay()];
    }
  }

  function getWeatherLocationName(lang) {
    return lang === "gr" ? "Λευκάδα" : "Lefkada";
  }

  // initialize
  // initialize
  document.addEventListener("DOMContentLoaded", async () => {
    attachLangButtons();
    const lang = getLang();
    updateLangButtons(lang);
    await loadContentAndRender(lang);
    initWeather();
  });
})();
