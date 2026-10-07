// Förstasidan: hjälte + kapitelindex, monterat från data/kapitel.json.
// Klonad från kapitelrapportens oversikt.js (samma klasser och CSS), men utan
// kart- och grafgalleri. Returnerar en DOM-nod som OJS visar.
//
// Data: data.rapport = { titel, titel_accent, underrubrik, ingress, svarande,
//   indikatorer, uppdaterad, datakalla }, data.kapitel[] = { id, nummer,
//   kategori, titel, ingress, farg, beskrivning, avsnitt: [{ id, titel }] }.
import { hallandskarta } from "./kartor/halland.js";

const LOGO = "logo_vit.svg";

function h(tag, attrs = {}, ...barn) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.setAttribute("style", v);
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const b of barn.flat()) {
    if (b == null) continue;
    el.appendChild(typeof b === "string" ? document.createTextNode(b) : b);
  }
  return el;
}

const tva = (n) => String(n).padStart(2, "0");
const fmt = (v) => (v == null ? "–" : Number(v).toLocaleString("sv-SE"));

// Tematiska linjeikoner per kapitel (24×24, stroke = currentColor).
const IKONER = {
  halsa: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  "psykisk-halsa": '<circle cx="12" cy="9.5" r="5.5"/><path d="M9.5 9.5h.01M14.5 9.5h.01"/><path d="M9.6 12.2c1.4 1.2 3.4 1.2 4.8 0"/><path d="M9 15.5v4.5M15 15.5v4.5"/>',
  tandhalsa: '<path d="M7 4c-2.2 0-3.5 1.8-3 4.5.4 2.3 1.4 3.5 1.8 6.5.3 2.4.7 5 2.2 5 1.6 0 1.4-4 2.5-5.5.4-.6 1.1-.6 1.5 0 1.1 1.5.9 5.5 2.5 5.5 1.5 0 1.9-2.6 2.2-5 .4-3 1.4-4.2 1.8-6.5.5-2.7-.8-4.5-3-4.5-1.8 0-2.6 1-5 1S8.8 4 7 4z"/>',
  levnadsvanor: '<circle cx="14" cy="4.6" r="1.8"/><path d="M9 21l2.4-6.2 2.6 2.2V21"/><path d="M6.5 12.5 9 9l4-1 2.5 3.5 3 1"/><path d="M11.4 14.8 13 8"/>',
  "tobak-alkohol": '<path d="M8 3h8l-1 7a3 3 0 0 1-6 0L8 3z"/><path d="M12 13v6"/><path d="M8.5 21h7"/>',
  livsvillkor: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10.5V20h12v-9.5"/><path d="M10 20v-5h4v5"/>',
  trygghet: '<path d="M12 3 5 6v5.5c0 4.5 3 8 7 9.5 4-1.5 7-5 7-9.5V6l-7-3z"/>',
  relationer: '<circle cx="9" cy="8" r="3.2"/><path d="M3.6 19c0-3 2.4-5 5.4-5s5.4 2 5.4 5"/><path d="M16 5.6a3 3 0 0 1 0 5.4"/><path d="M16.6 14c2.5.3 4.4 2.3 4.4 5"/>',
  identitet: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 13.5c.9 1.5 2.1 2.2 3.5 2.2s2.6-.7 3.5-2.2"/><path d="M9 9.5h.01M15 9.5h.01"/>',
  metod: '<path d="M4 20h16"/><path d="M7 20v-5"/><path d="M12 20V9"/><path d="M17 20V5"/><circle cx="7" cy="11.5" r="1.6"/><circle cx="12" cy="5.6" r="1.6"/>'
};
const ikon = (id) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IKONER[id] || IKONER.metod}</svg>`;

const SVG = {
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  pil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>',
  ned: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M6 13l6 6 6-6"/></svg>',
  metod: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 20h16"/><path d="M7 16v-5"/><path d="M12 16V6"/><path d="M17 16v-8"/></svg>'
};

export function oversikt({ data, geo, orter = [] }) {
  const r = data.rapport;
  const kapitel = data.kapitel || [];
  const stoppare = [];

  // ── HJÄLTE ──
  const kartEl = h("div", { class: "kr-hero-karta" });
  const siffra = (tal, text) => h("div", { class: "kr-siffra" }, h("dt", {}, text), h("dd", {}, tal));

  const hero = h("header", { class: "kr-hero" },
    h("div", { class: "kr-hero-bg" }),
    h("nav", { class: "kr-hero-nav", "aria-label": "Rapporten" },
      h("a", { class: "kr-hero-avsandare", href: "./" }, h("img", { class: "kr-logo", src: LOGO, alt: r.utgivare })),
      h("div", { class: "kr-hero-lankar" },
        h("a", { class: "kr-hero-lank", href: "#kapitel" }, "Kapitel"),
        h("a", { class: "kr-hero-lank kr-hero-lank--galleri", href: "metod/" },
          h("span", { html: SVG.metod }), "Om undersökningen"))),
    h("div", { class: "kr-hero-inner" },
      h("div", { class: "kr-hero-text" },
        h("p", { class: "kr-hero-kicker" }, `${r.avsandare} ${r.utgivare}`),
        h("h1", { class: "kr-hero-titel" }, r.titel, h("em", { class: "kr-hero-titel-accent" }, r.titel_accent)),
        r.underrubrik ? h("p", { class: "kr-hero-underrubrik" }, r.underrubrik) : null,
        h("p", { class: "kr-hero-ingress" }, r.ingress),
        r.datakalla === "syntetisk" ? h("p", { class: "hlv-hero-varning" },
          "Syntetisk testdata: alla siffror i rapporten är slumpade och får inte användas.") : null,
        h("div", { class: "kr-hero-cta" },
          h("a", { class: "kr-knapp kr-knapp--prim", href: "#kapitel" }, h("span", {}, "Läs rapporten"), h("span", { class: "kr-knapp-ikon", html: SVG.ned })),
          h("a", { class: "kr-knapp kr-knapp--sek", href: "metod/" },
            h("span", { class: "kr-knapp-ikon", html: SVG.metod }), h("span", {}, "Om undersökningen och metoden"))),
        h("dl", { class: "kr-hero-siffror" },
          siffra(String(kapitel.length), "Kapitel"),
          siffra(fmt(r.indikatorer), "Indikatorer"),
          siffra(fmt(r.svarande), "Svarande 2026"),
          siffra(r.uppdaterad_kort || r.uppdaterad, "Uppdaterad"))),
      h("figure", { class: "kr-hero-figur" },
        kartEl,
        h("figcaption", { class: "kr-hero-figurtext" },
          `Hallands sex kommuner och ${orter.length} tätorter. Källa: SCB.`)))
  );

  stoppare.push(hallandskarta(kartEl, geo, { orter }));

  // ── KAPITELINDEX ──
  const index = h("ol", { class: "kr-index", "aria-label": "Rapportens kapitel" });

  kapitel.forEach((k) => {
    const avsnitt = k.avsnitt || [];
    const lista = h("ol", { class: "kr-rad-avsnittlista" },
      ...avsnitt.map((a, j) => h("li", {},
        h("a", { href: `${k.id}/#${k.id}-${a.id}` },
          h("span", { class: "kr-rad-avsnitt-num" }, tva(j + 1)),
          h("span", { class: "kr-rad-avsnitt-titel" }, a.titel)))));
    const panelId = `kr-avsnitt-${k.id}`;
    const panel = h("div", { class: "kr-rad-avsnitt", id: panelId, role: "region", "aria-label": `Avsnitt i ${k.titel}` },
      h("div", { class: "kr-rad-avsnitt-inner" }, lista));

    const vaxla = h("button", { type: "button", class: "kr-rad-vaxla", "aria-expanded": "false", "aria-controls": panelId },
      h("span", {}, "Innehåll"), h("span", { class: "kr-rad-vaxla-n" }, `${avsnitt.length} avsnitt`),
      h("span", { class: "kr-rad-vaxla-glyf", html: SVG.chevron }));

    const rad = h("li", { class: "kr-rad", style: `--accent:${k.farg}`, id: `kapitel-${k.id}` },
      h("div", { class: "kr-rad-num", "aria-hidden": "true" }, tva(k.nummer)),
      h("div", { class: "kr-rad-huvud" },
        h("div", { class: "kr-rad-kat" }, h("span", { class: "kr-rad-ikon", html: ikon(k.id) }), `Kapitel ${tva(k.nummer)} · ${k.kategori}`),
        h("h2", { class: "kr-rad-titel" }, h("a", { href: `${k.id}/` }, k.titel)),
        h("p", { class: "kr-rad-beskrivning" }, k.beskrivning || k.ingress),
        h("div", { class: "kr-rad-meta" },
          h("a", { class: "kr-rad-las", href: `${k.id}/` }, h("span", {}, "Läs hela kapitlet"), h("span", { class: "kr-rad-las-pil", html: SVG.pil })),
          avsnitt.length ? vaxla : null)),
      panel);

    vaxla.addEventListener("click", () => {
      const oppen = vaxla.getAttribute("aria-expanded") !== "true";
      vaxla.setAttribute("aria-expanded", String(oppen));
      rad.classList.toggle("ar-oppen", oppen);
    });
    index.appendChild(rad);
  });

  const innehall = h("main", { class: "kr-content", id: "kapitel", tabindex: "-1" }, index);

  // ── FOOTER ──
  const footer = h("footer", { class: "kr-footer" },
    h("img", { class: "kr-footer-logo", src: LOGO, alt: r.utgivare }),
    h("div", { class: "kr-footer-meta" }, `Senast uppdaterad ${r.uppdaterad}`));

  const rot = h("div", { class: "kr-app" }, hero, innehall, footer);
  rot._cleanup = () => stoppare.forEach((s) => s && s());
  return rot;
}
