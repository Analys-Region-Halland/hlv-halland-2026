// =============================================================================
// HLVFIGUR — en figur per indikator i HLV-rapporten.
//
// Kapitelsidorna innehåller platshållare
//   <div class="hlv-figur" data-id="…" data-niva="…">.
// hlvMontera() hämtar ../data/ind/<id>.json när figuren närmar sig skärmen och
// ritar figuren. Figurer i en stängd <details> ritas när den öppnas.
//
// data-niva anger redovisningsnivån. Varje nivå har ett eget, fast diagram
// utan andra val än skalan:
//   lan         Halland över tid, riket som streckad tvilling
//   kon         kvinnor och män över tid, alla som grå referens
//   alder       en linje per åldersgrupp, alla 16–84 år som grå referens
//   utbildning  en linje per utbildningsnivå (25–84 år, åldersstandardiserat)
//   fodelse     inrikes och utrikes födda
//   kommun      en panel per kommun med länet som grå linje; grön bock i
//               panelrubriken = statistiskt säkerställd skillnad mot länet
//   regso       punktdiagram: ett område per rad, grupperat per kommun, med
//               konfidensintervall och länets nivå; färgen visar testets
//               utfall (ur data.tester, alltså samma test som i texten)
// Diagrammen påstår aldrig själva att en skillnad är säkerställd. Det gör
// bara testtabellen ovanför diagrammet och, för RegSO, färgerna, som båda läser
// resultatet av steg 12.
//
// data-niva="utforska" (eller inget värde) ger hela verktyget med tre flikar:
//   Över tid          linjediagram 2014–2026 som små multiplar.
//                     Dela upp:  Ingen | Ålder | Kommun  (en panel per grupp)
//                     Serier:    Totalt, Kvinnor, Män (av/på var för sig)
//                     Riket:     Egen panel (Halland och riket sida vid sida;
//                                med Ålder ett rutnät ålder × område) |
//                                I samma panel (streckad tvilling) | Av
//   Svarsfördelning   alla svarsalternativ per år, med samma val.
//   Egen jämförelse   en kolumn där man bygger serier av område, kön och ålder
//                     och drar dem till diagrammet (eller trycker Lägg till).
//                     Valet delas av alla diagram på sidan och sparas.
//
// Designreglerna (se metodkapitlet, "Så läser du diagrammen"):
//   – få serier i samma panel (superposition), annars egna paneler
//     (juxtaposition), alltid med delad skala (Gleicher m.fl. 2011, Javed
//     m.fl. 2010, Datawrapper 2024)
//   – panelerna i logisk ordning: ålder stigande, kommuner norr–söder
//   – anpassad skala med minsta spann (20 procentenheter) och markering när
//     axeln inte börjar på 0; alternativ: hela skalan (0–100 % eller 7–35)
//   – panelernas form: små multiplar nära kvadratiska (bredd/höjd ≈ 1,2),
//     en ensam panel bredare (≈ 1,8); höjden följer bredden, inte reglagen
//     (Cleveland 1993; Heer och Agrawala 2006)
//   – tunna linjer och runda punkter med vit ring, raka linjer, avbrott vid
//     tidsseriebrott
//   – inga konfidensintervall i diagrammen; de står i verktygstips och tabell
//   – färger ur Region Hallands profil: totalt grön, kvinnor orange, män blå
//     (kontrollerade för nedsatt färgseende); riket streckat med ihåliga
//     punkter i samma färg
//   – direktetiketter vid linjeslutet i värdeordning, centrerade kring
//     linjeändarna och förbundna med tunna linjer (som Our World in Data)
//   – hårkors och tooltip bara i panelen man pekar på; tooltipen läggs vid
//     sidan av hårkorset så att den aldrig täcker punkterna, och visar
//     Halland mot riket (eller kommun mot Halland), skillnad och förändring
//   – egen jämförelse: åtta färger som klarar färgseendekontroll, färgen följer
//     serien (inte ordningen)
//   – av/på-knappar med aria-pressed; dragning har alltid ett klickalternativ
//     (WCAG 2.2, 2.5.7)
// =============================================================================

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { addExportButton } from "../lib/exportSvg.js";
import { skapaRam, TYP, FARG, valPill, segment, skapaTooltip, ritbredd, matText } from "../lib/grafRam.js";

// Ritbredd på desktop: samma som figurrutans inre bredd, så att text och
// linjer ritas i naturlig storlek
const BREDD = 880;
// På smala skärmar: nära den verkliga bredden (som övriga rapportgrafer)
const ritW = () => { const w = ritbredd(BREDD); return w < BREDD ? ritbredd(780) : w; };

// ── Färger och linjer (Region Hallands profil, kontrollerade med
// validate_palette: ljusband, kroma, färgseende och kontrast godkända) ──
// Linjernas roller som i hosrapporten: totalt är fokus (grön, 2 px), grupperna
// 1,75 px, jämförelsen (länet) en tunn grå linje utan punkter
const SERIE = {
  Totalt:  { farg: "#00664D", bredd: 2, r: 3.5, form: "cirkel" },
  Kvinnor: { farg: "#E06D00", bredd: 1.75, r: 2.75, form: "cirkel" },
  "Män":   { farg: "#1F5FA8", bredd: 1.75, r: 2.75, form: "cirkel" },
  Halland: { farg: "#A3A8A5", bredd: 1.4, r: 0, form: "ingen" }
};
const KON = ["Totalt", "Kvinnor", "Män"];
// Riket som tvilling i samma panel: samma färg, streckad, ihåliga punkter
const RIKET_STIL = { bredd: 1.25, streck: "5,4", hal: true };
// Etiketterna vid linjeslutet och axlarna (hosrapportens grafspråk)
const ETIKETT = { storlek: 13, avstand: 17, hake: "#8E8E89", ref: "#4E5450" };
const AXEL = { text: "#1A1A1A", grid: "#CBCBC4", linje: "#1A1A1A" };
// Egen jämförelse: validerad palett ur profilens färger
const EGEN_FARGER = ["#1F5FA8", "#E06D00", "#007A5C", "#6650B8", "#B8321F", "#2390C8", "#8C7A00", "#A0587F"];
const EGEN_MAX = EGEN_FARGER.length;
const XAR = [2014, 2018, 2022, 2026];
const ALDRAR = ["16–29", "30–44", "45–64", "65–84", "85+"];
const UTBILDNING = ["Förgymnasial", "Gymnasial", "Eftergymnasial"];
const FODELSE = ["Inrikes född", "Utrikes född"];
// Nivåernas färger, ur samma validerade palett som egen jämförelse. Färgen
// följer gruppen, inte ordningen.
const NIVA_FARG = {
  "16–29": "#2390C8", "30–44": "#007A5C", "45–64": "#8C7A00", "65–84": "#E06D00", "85+": "#B8321F",
  "Förgymnasial": "#E06D00", "Gymnasial": "#6650B8", "Eftergymnasial": "#1F5FA8",
  "Inrikes född": "#1F5FA8", "Utrikes född": "#E06D00"
};
// Testutfall (RegSO-punkterna och bockarna i kommunpanelerna). Som i
// rapportens tabeller: grön bock = statistiskt säkerställd, grått = inte.
// Riktningen syns av punktens läge mot länets linje.
const SAK_FARG = "#00664D";
const UTFALL = {
  hogre: { farg: SAK_FARG, sak: true, text: "statistiskt säkerställt högre än länet" },
  lagre: { farg: SAK_FARG, sak: true, text: "statistiskt säkerställt lägre än länet" },
  ingen: { farg: "#9AA09D", sak: false, text: "ingen statistiskt säkerställd skillnad mot länet" },
  ej:    { farg: "#9AA09D", sak: false, text: "inte testat" }
};
const NIVA_TITEL = {
  lan: "länet över tid och jämfört med riket", kon: "kvinnor och män", alder: "åldersgrupper",
  utbildning: "utbildningsnivå", fodelse: "födelseland", kommun: "kommunerna", regso: "områden i länet (RegSO)"
};
const VET_INTE = /^(vet inte|osäker|ingen åsikt|vill inte)/i;
const LOGO = "../logo_farg.svg";
const KALLA = "Källa: Hälsa på lika villkor, Region Halland, Folkhälsomyndigheten och SCB. Bearbetning: Region Halland.";

const fmtTal = (v, dec = 0) => v == null || Number.isNaN(+v) ? "–" :
  (+v).toLocaleString("sv-SE", { minimumFractionDigits: dec, maximumFractionDigits: dec });

// ── Val som delas av alla figurer på sidan och sparas mellan besök ──
const lasLagrat = (nyckel, standard) => { try { const v = localStorage.getItem(nyckel); return v == null ? standard : JSON.parse(v); } catch (e) { return standard; } };
const sparaLagrat = (nyckel, v) => { try { localStorage.setItem(nyckel, JSON.stringify(v)); } catch (e) { /* privat läge */ } };
let globalSkala = lasLagrat("hlv-skala-v2", "anpassad");
function sattGlobalSkala(s) {
  globalSkala = s; sparaLagrat("hlv-skala-v2", s);
  window.dispatchEvent(new CustomEvent("hlv-skala", { detail: s }));
}
// Egen jämförelse: [{ nyckel: "Halland|Kvinnor|30–44", farg: "#…" }]
let globalEgen = (() => {
  const v = lasLagrat("hlv-egen", null);
  if (!Array.isArray(v)) return [{ nyckel: "Halland|Totalt|alla", farg: EGEN_FARGER[0] }, { nyckel: "Riket|Totalt|alla", farg: EGEN_FARGER[1] }];
  // Sparade val från en äldre palett får nya, lediga färger
  const ut = [];
  v.filter(x => x && typeof x.nyckel === "string").slice(0, EGEN_MAX).forEach(x => {
    const ledig = (f) => !ut.some(u => u.farg === f);
    ut.push({ nyckel: x.nyckel, farg: EGEN_FARGER.includes(x.farg) && ledig(x.farg) ? x.farg : EGEN_FARGER.find(ledig) });
  });
  return ut;
})();
function sattGlobalEgen(lista) {
  globalEgen = lista; sparaLagrat("hlv-egen", lista);
  window.dispatchEvent(new CustomEvent("hlv-egen"));
}

// Punkter: runda, fyllda med vit ring (skiljer överlappande punkter åt) eller
// ihåliga för riket
function markor(g, cx, cy, form, farg, r, hal = false) {
  if (form === "ingen" || !(r > 0)) return null;
  return g.append("circle").attr("cx", cx).attr("cy", cy).attr("r", r)
    .attr("fill", hal ? "#fff" : farg).attr("stroke", hal ? farg : "#fff").attr("stroke-width", hal ? 1.3 : 1.25);
}

// Grön bock (statistiskt säkerställd), samma tecken som i rapportens tabeller
function bock(g, cx, cy, r = 6) {
  const b = g.append("g").attr("transform", `translate(${cx},${cy})`).attr("role", "img").attr("aria-label", "statistiskt säkerställd");
  b.append("title").text("Statistiskt säkerställd");
  b.append("circle").attr("r", r).attr("fill", SAK_FARG);
  b.append("path").attr("d", `M${-r * 0.45},${r * 0.02} L${-r * 0.1},${r * 0.36} L${r * 0.48},${-r * 0.34}`)
    .attr("fill", "none").attr("stroke", "#fff").attr("stroke-width", r * 0.3).attr("stroke-linecap", "round").attr("stroke-linejoin", "round");
  return b;
}

// Textfärg för en serie: seriens nyans, mörkad tills kontrasten mot vitt är
// minst 4,5:1 (WCAG 1.4.3)
function luminans(c) {
  const { r, g, b } = d3.rgb(c);
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const textFargCache = new Map();
function textFarg(c) {
  if (textFargCache.has(c)) return textFargCache.get(c);
  const h = d3.hsl(c);
  for (let i = 0; i < 30 && 1.05 / (luminans(h.formatHex()) + 0.05) < 4.5; i++) h.l -= 0.02;
  textFargCache.set(c, h.formatHex());
  return h.formatHex();
}

// Direktetiketter utan överlapp: etiketterna sorteras efter värde (högst
// överst), grupper som krockar slås ihop och centreras kring medelvärdet av
// sina linjeändar. Ytan ovanför och under panelen får användas.
function placeraEtiketter(poster, avst, ovre, nedre) {
  const arr = [...poster].sort((a, b) => a.ideal - b.ideal);
  if (!arr.length) return arr;
  let kl = arr.map(e => ({ e: [e], c: e.ideal }));
  const topp = (k) => k.c - (k.e.length - 1) * avst / 2;
  const klamra = (k) => {
    const h = (k.e.length - 1) * avst;
    k.c = h > nedre - ovre ? ovre + h / 2 : Math.max(ovre + h / 2, Math.min(nedre - h / 2, k.c));
  };
  for (let varv = 0; varv < 200; varv++) {
    kl.forEach(klamra);
    const i = kl.findIndex((b, j) => j > 0 && topp(kl[j - 1]) + kl[j - 1].e.length * avst > topp(b) + 0.01);
    if (i < 0) break;
    const e = [...kl[i - 1].e, ...kl[i].e];
    kl.splice(i - 1, 2, { e, c: d3.mean(e, q => q.ideal) });
  }
  kl.forEach(k => k.e.forEach((e, j) => { e.y = topp(k) + j * avst; }));
  return arr;
}
// Liten markör i en HTML-knapp eller lista
function markorIkon(parent, s, bredd = 24) {
  const sv = parent.append("svg").attr("width", bredd).attr("height", 12).attr("aria-hidden", "true").attr("class", "hlv-ikon");
  if (bredd > 14) sv.append("line").attr("x1", 1).attr("x2", bredd - 1).attr("y1", 6).attr("y2", 6).attr("stroke", s.farg)
    .attr("stroke-width", Math.min(s.bredd || 2, 2.6)).attr("stroke-dasharray", s.streck || null);
  if (s.bock) bock(sv, bredd / 2, 6, 5.5);
  else markor(sv, bredd / 2, 6, s.form || "cirkel", s.farg, 3.4, s.hal);
  return sv;
}

// =============================================================================
// MONTERING
// =============================================================================
export function hlvMontera(rot = document) {
  const platser = [...rot.querySelectorAll(".hlv-figur[data-id]:not([data-monterad])")];
  const ladda = (el) => {
    if (el.dataset.monterad) return;
    el.dataset.monterad = "1";
    fetch(`../data/ind/${el.dataset.id}.json`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(data => { el.innerHTML = ""; el.appendChild(hlvFigur(data, el.dataset.niva || "utforska")); })
      .catch(err => {
        el.innerHTML = `<p class="hlv-fel">Diagrammet kunde inte laddas (${el.dataset.id}).</p>`;
        console.error("hlvFigur", el.dataset.id, err);
      });
  };
  // Figurer i en stängd <details> (Utforska själv) ritas när den öppnas:
  // innan dess har de ingen bredd att rita i
  const iDetaljer = (el) => { const d = el.closest("details"); return d && !d.open ? d : null; };
  platser.filter(iDetaljer).forEach(el => iDetaljer(el).addEventListener("toggle", function vid() {
    if (this.open) { this.removeEventListener("toggle", vid); ladda(el); }
  }));
  const synliga = platser.filter(el => !iDetaljer(el));
  if (!("IntersectionObserver" in window)) { synliga.forEach(ladda); return; }
  const io = new IntersectionObserver((poster) => {
    poster.forEach(p => { if (p.isIntersecting) { io.unobserve(p.target); ladda(p.target); } });
  }, { rootMargin: "800px 0px" });
  synliga.forEach(el => io.observe(el));
  if (/^#graf-/.test(location.hash)) platser.forEach(ladda);
}

// =============================================================================
// FIGUREN
// =============================================================================
export function hlvFigur(data, niva = "utforska") {
  // JSON från R gör listor med ett element till skalärer: normalisera till listor
  const lista = (v) => v == null ? [] : Array.isArray(v) ? v : [v];
  data.ar = lista(data.ar);
  data.kommuner_ordning = lista(data.kommuner_ordning);
  data.fragor = lista(data.fragor);
  data.skattningar = lista(data.skattningar);
  data.fordelningar = lista(data.fordelningar);
  data.tester = lista(data.tester);
  data.omraden = lista(data.omraden);
  const nivaLage = niva !== "utforska" && NIVA_TITEL[niva] != null;
  if (data.skala != null && !Array.isArray(data.skala)) data.skala = null;
  if (data.matt) data.matt.fragor = lista(data.matt.fragor);
  const andel = data.enhet === "procent";
  const dec = andel ? 0 : 1;
  const fmtV = (v) => fmtTal(v, dec);
  const fmtVE = (v) => andel ? `${fmtTal(v, 0)} %` : `${fmtTal(v, 1)} p`;
  const sk = data.skattningar || [];
  const fo = data.fordelningar || [];
  const syntetisk = data.datakalla === "syntetisk";
  const kommuner = (data.kommuner_ordning || []).filter(k => sk.some(d => d.geo === k));

  // Testutfall för en nivå senaste teståret: { grupp: "hogre" | "lagre" },
  // bara de statistiskt säkerställda (data.tester kommer ur steg 12)
  // Bara jämförelsen mot länet samma år (inte par, tid eller trend)
  const motLan = (x) => ["kommun", "omrade", "snitt"].includes(x.t);
  const utfallAr = (niv) => d3.max(data.tester.filter(x => x.niva === niv && motLan(x)), x => x.ar);
  function utfallFor(niv, allaUtfall = false) {
    const ar = utfallAr(niv);
    return Object.fromEntries(data.tester.filter(x => x.niva === niv && motLan(x) && x.ar === ar && (allaUtfall || x.u === "hogre" || x.u === "lagre"))
      .map(x => [x.g, x.u]));
  }

  // Uppslag: år|geografi|grupptyp|grupp
  const index = new Map(sk.map(d => [`${d.ar}|${d.geo}|${d.gt}|${d.g}`, d]));
  const rad = (ar, geo, gt, g) => index.get(`${ar}|${geo}|${gt}|${g}`);
  const synlig = (d) => d && !d.u && d.v != null;
  const finnsSerie = (geo, gt, g) => data.ar.some(a => synlig(rad(a, geo, gt, g)));

  const indAr = (data.ar || []).filter(a => sk.some(d => d.ar === a && d.geo === "Halland" && synlig(d)));
  const ettAr = indAr.length <= 1;
  const harRiket = sk.some(d => d.geo === "Riket" && synlig(d));
  const harRiketFo = fo.some(d => d.geo === "Riket" && !d.u && d.v != null);

  // Grupptyp och grupp för ett kön (Totalt/Kvinnor/Män) och en åldersgrupp (eller null = 16–84)
  const gtg = (k, a) => a == null
    ? (k === "Totalt" ? { gt: "Totalt", g: "Totalt" } : { gt: "Kön", g: k })
    : (k === "Totalt" ? { gt: "Ålder", g: a } : { gt: "Kön och ålder", g: `${k} ${a}` });

  // ── Flikar och tillstånd ──
  const vyer = [];
  const tidsTyp = ["kod", "funktion", "medel"].includes(data.typ) && indAr.length;
  if (tidsTyp) vyer.push({ key: "tid", label: ettAr ? "Resultat" : "Över tid" });
  if (fo.length) vyer.push({ key: "fordelning", label: "Svarsfördelning" });
  if (tidsTyp) vyer.push({ key: "egen", label: "Egen jämförelse" });

  const ram = skapaRam({ title: nivaLage ? `${data.rubrik}: ${NIVA_TITEL[niva]}` : data.rubrik, subtitle: "", caption: "" });
  ram.container.classed("hlv-graf", true);
  if (!vyer.length || (nivaLage && !indAr.length)) {
    ram.svgWrap.append("p").attr("class", "hlv-tom").text("Det finns inga skattningar att visa för indikatorn.");
    return ram.node();
  }

  const reglage = ram.header.append("div").attr("class", "hlv-reglage");
  const legendEl = ram.body.insert("div", ".graf-svg-container").attr("class", "hlv-legend");
  const tabellEl = ram.body.append("div").attr("class", "hlv-tabell").style("display", "none");
  const tooltip = skapaTooltip(ram.body);

  const st = {
    vy: vyer[0].key,
    dela: "ingen",                                   // ingen | alder | kommun
    serier: { Totalt: true, Kvinnor: true, "Män": true },
    riket: harRiket ? "egen" : "av",                 // egen | samma | av
    skala: globalSkala,
    fraga: 0,
    bygg: { geo: "Halland", kon: "Totalt", alder: "alla" }
  };
  let tabell = { rubriker: [], rader: [] }, tabellSynlig = false;
  let byggEl = null, diagramEl = null;

  window.addEventListener("hlv-skala", (e) => { if (st.skala !== e.detail) { st.skala = e.detail; if (ram.container.node().isConnected) rita(); } });
  window.addEventListener("hlv-egen", () => { if (st.vy === "egen" && ram.container.node().isConnected) { uppdateraBygg(); ritaEgen(); } });

  // ── Reglage ──
  function byggReglage() {
    reglage.selectAll("*").remove();
    const grupp = (etikett) => {
      const g = reglage.append("div").attr("class", "hlv-reglage-grupp");
      if (etikett) g.append("span").attr("class", "hlv-reglage-etikett").text(etikett);
      return g;
    };
    if (vyer.length > 1) {
      segment(grupp(null), { options: vyer.map(v => v.label), activeIndex: vyer.findIndex(v => v.key === st.vy),
        onSelect: (i) => { st.vy = vyer[i].key; rita(); } });
    }
    if (st.vy === "egen") {
      skalVal(grupp("Skala"));
      return;
    }
    // Dela upp: kommunerna finns bara för skattningarna, inte för svarsfördelningen
    const delningar = [{ key: "ingen", label: "Ingen" }, { key: "alder", label: "Ålder" }];
    if (st.vy === "tid" && data.visa_kommun && kommuner.length) delningar.push({ key: "kommun", label: "Kommun" });
    const aktivDela = delningar.findIndex(d => d.key === st.dela);
    segment(grupp("Dela upp"), { options: delningar.map(d => d.label), activeIndex: aktivDela < 0 ? 0 : aktivDela,
      onSelect: (i) => { st.dela = delningar[i].key; rita(); } });
    serieKnappar(grupp("Serier"));
    const harR = st.vy === "tid" ? harRiket : harRiketFo;
    if (harR) {
      const val = st.vy === "tid" && !ettAr
        ? [{ key: "egen", label: "Egen panel" }, { key: "samma", label: "I samma panel" }, { key: "av", label: "Av" }]
        : [{ key: "egen", label: "Visa" }, { key: "av", label: "Av" }];
      const nu = st.riket === "samma" && val.length === 2 ? "egen" : st.riket;
      segment(grupp("Riket"), { options: val.map(v => v.label), activeIndex: Math.max(0, val.findIndex(v => v.key === nu)),
        onSelect: (i) => { st.riket = val[i].key; rita(); } });
    }
    if (st.vy === "tid") skalVal(grupp("Skala"));
  }
  function skalVal(g) {
    const hela = andel ? "Hela (0–100 %)" : (data.skala ? `Hela (${data.skala[0]}–${data.skala[1]})` : "Från noll");
    segment(g, { options: ["Anpassad", hela], activeIndex: st.skala === "hela" ? 1 : 0,
      onSelect: (i) => { st.skala = i === 1 ? "hela" : "anpassad"; sattGlobalSkala(st.skala); rita(); } });
  }
  // Av/på-knappar för Totalt, Kvinnor och Män (minst en är alltid på)
  function serieKnappar(g) {
    const wrap = g.append("div").attr("class", "hlv-chips").attr("role", "group").attr("aria-label", "Serier i diagrammet");
    KON.forEach(k => {
      const b = wrap.append("button").attr("type", "button").attr("class", "hlv-chip")
        .attr("aria-pressed", st.serier[k] ? "true" : "false")
        .on("click", () => {
          const pa = KON.filter(x => st.serier[x]);
          if (st.serier[k] && pa.length === 1) return;   // sista serien får inte släckas
          st.serier[k] = !st.serier[k]; rita();
        });
      markorIkon(b, { ...SERIE[k], bredd: 2 }, 12);
      b.append("span").text(k);
    });
  }

  // ── Legend, tabell och verktyg ──
  function legend(poster) {
    legendEl.selectAll("*").remove();
    legendEl.style("display", poster.length ? null : "none");
    poster.forEach(p => {
      const s = legendEl.append("span").attr("class", "hlv-legend-post");
      if (p.ruta) s.append("svg").attr("width", 12).attr("height", 12).attr("aria-hidden", "true")
        .append("rect").attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", p.farg);
      else markorIkon(s, p, p.bredd === 0 ? 12 : 24);
      s.append("span").text(p.namn);
    });
  }
  function sattTabell(rubriker, rader) {
    tabell = { rubriker, rader };
    tabellEl.selectAll("*").remove();
    const t = tabellEl.append("table").attr("class", "hlv-datatabell");
    t.append("thead").append("tr").selectAll("th").data(rubriker).join("th").text(d => d);
    t.append("tbody").selectAll("tr").data(rader).join("tr").selectAll("td").data(r => r).join("td").text(d => d);
  }
  function infoHtml() {
    const m = data.matt;
    if (!m) return null;
    const li = (m.fragor || []).map(f => `<li><b>${f.nr ? "Fråga " + f.nr : ""}</b> <code>${f.var}</code> ${f.text}</li>`).join("");
    return `<p><b>${m.typ}</b>${m.antal > 1 ? ` · ${m.antal} frågor` : ""}</p><ul class="hlv-info-lista">${li}</ul>` +
      (m.regel ? `<p>${m.regel}</p>` : "") + `<p>Frågenummer avser 2026 års enkät.</p>`;
  }
  function verktyg(svg, W, H, subtitle, caption) {
    addExportButton(ram.container, svg.node(), { title: data.rubrik, subtitle, caption, width: W, height: H, logo: LOGO,
      altText: `${data.rubrik}. ${subtitle}`, info: infoHtml() });
    const knappar = ram.tools.select(".graf-tools-knappar");
    knappar.insert("button", ":first-child").attr("type", "button")
      .attr("class", "graf-ikonknapp").attr("aria-label", "Visa som tabell").attr("data-tip", "Visa tabell")
      .attr("aria-pressed", tabellSynlig ? "true" : "false")
      .html('<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/></svg>')
      .on("click", function () { tabellSynlig = !tabellSynlig; tabellEl.style("display", tabellSynlig ? null : "none"); d3.select(this).attr("aria-pressed", String(tabellSynlig)); });
    knappar.insert("button", ":first-child").attr("type", "button")
      .attr("class", "graf-ikonknapp").attr("aria-label", "Ladda ner data som CSV").attr("data-tip", "Ladda ner data (CSV)")
      .html('<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 13h7M8.5 16.5h7"/></svg>')
      .on("click", laddaNerCsv);
  }
  function laddaNerCsv() {
    const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const txt = [tabell.rubriker, ...tabell.rader].map(r => r.map(esc).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + txt], { type: "text/csv;charset=utf-8" }));
    a.download = `${data.id}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const tipVarde = (d) => !d ? "–" : d.u ? "för få svarande" : `${fmtVE(d.v)} <span class="hlv-tip-ki">(${fmtV(d.l)}–${fmtV(d.h)})</span>`;
  const tabellRader = (paneler, arLista) => paneler.flatMap(p => p.serier.flatMap(s => arLista.map(a => {
    const d = rad(a, s.geo, s.gt, s.g);
    return d ? [p.etikett, s.namn, a, d.u ? "–" : fmtV(d.v), d.u ? "" : fmtV(d.l), d.u ? "" : fmtV(d.h), d.n] : null;
  }).filter(Boolean)));
  const TABELLHUVUD = ["Panel", "Serie", "År", "Värde", "95 % KI, nedre", "95 % KI, övre", "Antal svarande"];

  function rita() {
    tooltip.dolj();
    ram.controlsLeft.selectAll("*").remove();
    ram.controlsRight.selectAll("*").remove();
    ram.body.selectAll(".graf-meny").remove();
    if (nivaLage) {
      reglage.selectAll("*").remove();
      if (niva !== "regso") {
        const g = reglage.append("div").attr("class", "hlv-reglage-grupp");
        g.append("span").attr("class", "hlv-reglage-etikett").text("Skala");
        skalVal(g);
      }
      ram.svgWrap.selectAll("*").remove();
      ritaNiva();
      tabellEl.style("display", tabellSynlig ? null : "none");
      return;
    }
    byggReglage();
    const egen = st.vy === "egen";
    ram.container.classed("hlv-egen-lage", egen);
    if (egen) {
      if (!byggEl) {
        ram.svgWrap.selectAll("*").remove();
        byggEl = ram.svgWrap.append("div").attr("class", "hlv-bygg");
        diagramEl = ram.svgWrap.append("div").attr("class", "hlv-egen-diagram");
        byggKolumn();
      }
      uppdateraBygg();
      ritaEgen();
    } else {
      byggEl = null; diagramEl = null;
      ram.svgWrap.selectAll("*").remove();
      if (st.vy === "tid") (ettAr ? ritaEttAr : ritaTid)(); else ritaFordelning();
    }
    tabellEl.style("display", tabellSynlig ? null : "none");
  }

  // ===========================================================================
  // PANELER
  // Varje panel är en grupp (Halland/riket, en åldersgrupp, en kommun).
  // Inne i panelen: valda serier (Totalt, Kvinnor, Män). Riket blir antingen
  // egna paneler (rutnät grupp × område) eller en streckad tvilling.
  // ===========================================================================
  function paneler({ tvillingAlltid = false } = {}) {
    const valda = KON.filter(k => st.serier[k]);
    const visaRiket = harRiket && st.riket !== "av";
    const egenPanel = visaRiket && st.riket === "egen" && !tvillingAlltid;
    const tvilling = visaRiket && !egenPanel;
    const serier = (geo, a) => valda.map(k => ({ ...SERIE[k], namn: k, kon: k, geo, ...gtg(k, a) }));
    // grupp = antal paneler som hör ihop (2 = Halland och riket sida vid sida)
    let lista = [], cols = null, grupp = 1, kolRubriker = null;

    if (st.dela === "alder") {
      ALDRAR.forEach(a => {
        lista.push({ titel: `${a} år`, etikett: `${a} år${egenPanel ? ", Halland" : ""}`, geo: "Halland", alder: a, serier: serier("Halland", a) });
        if (egenPanel) lista.push({ titel: null, etikett: `${a} år, riket`, geo: "Riket", alder: a, riketPanel: true, serier: serier("Riket", a) });
      });
      if (egenPanel) { grupp = 2; kolRubriker = ["Halland", "Riket"]; }
    } else if (st.dela === "kommun") {
      // Kommunerna redovisas bara totalt (inte efter kön eller ålder), så
      // även länets panel visar bara totalt
      const tot = (geo, namn) => ({ ...SERIE.Totalt, namn, kon: "Totalt", geo, ...gtg("Totalt", null) });
      lista.push({ titel: "Halland", etikett: "Halland", geo: "Halland", serier: [tot("Halland", "Länet")] });
      if (egenPanel) lista.push({ titel: "Riket", etikett: "Riket", geo: "Riket", riketPanel: true, serier: [tot("Riket", "Riket")] });
      const ut = utfallFor("kommun");
      kommuner.forEach(k => lista.push({ titel: k, bock: !!(ut[k] && UTFALL[ut[k]].sak), etikett: k, geo: k, kommun: true, serier: [
        { ...SERIE.Halland, namn: "Länet", kon: "Totalt", geo: "Halland", ...gtg("Totalt", null), ref: true },
        tot(k, "Kommunen")] }));
    } else {
      lista.push({ titel: egenPanel ? "Halland" : null, etikett: "Halland", geo: "Halland", serier: serier("Halland", null) });
      if (egenPanel) { lista.push({ titel: "Riket", etikett: "Riket", geo: "Riket", riketPanel: true, serier: serier("Riket", null) }); cols = 2; }
    }
    if (tvilling) lista.forEach(p => {
      p.serier = [...p.serier, ...p.serier.filter(s => !s.ref).map(s => ({
        ...s, ...RIKET_STIL, r: Math.max(2.5, s.r - 0.3), geo: "Riket", riket: true, bas: s, namn: `${s.namn}, riket` }))];
    });
    return { lista, cols, grupp, kolRubriker, egenPanel, tvilling };
  }
  const huvudserie = (p) => p.serier.find(s => !s.ref && !s.riket);

  function legendSerier(P, punkter = false) {
    if (st.dela === "kommun") {
      return legend([{ namn: "Kommunen (i första panelen länet)", farg: SERIE.Totalt.farg, bredd: SERIE.Totalt.bredd, form: "cirkel" },
        { namn: "Länet, som jämförelse", farg: SERIE.Halland.farg, bredd: SERIE.Halland.bredd, form: "ingen" }]);
    }
    const p0 = P.lista[0];
    const poster = p0.serier.filter(s => !s.ref && !s.riket).map(s => ({ namn: s.namn, farg: s.farg, bredd: s.bredd, form: s.form }));
    const ref = P.lista.find(p => p.serier.some(s => s.ref));
    if (ref) { const s = ref.serier.find(x => x.ref); poster.push({ namn: s.namn, farg: s.farg, bredd: s.bredd, form: "ingen" }); }
    if (P.tvilling) poster.push(punkter ? { namn: "Riket (ihålig punkt, samma färg)", farg: FARG.text, bredd: 0, form: "cirkel", hal: true }
      : { namn: "Riket (streckad, samma färg)", farg: FARG.text, bredd: 1.3, form: "cirkel", hal: true, streck: RIKET_STIL.streck });
    legend(poster);
  }
  function undertitel(P, avkortad, dom, ar) {
    const matt = andel ? "Andel i procent" : "Medelvärde, poäng";
    const alder = st.dela === "alder" ? "16–84 år och 85+" : "16–84 år";
    const panel = {
      ingen: P.egenPanel ? " Halland och riket i var sin panel." : "",
      alder: P.egenPanel ? " Varje åldersgrupp har två paneler: Halland till vänster, riket till höger." : " En panel per åldersgrupp.",
      kommun: ` En panel per kommun, norr till söder; den grå linjen är Halland.${P.egenPanel ? " Riket i egen panel." : ""}` +
        (Object.keys(utfallFor("kommun")).length ? ` Grön bock vid namnet: kommunen skiljer sig statistiskt säkerställt från länet ${utfallAr("kommun")}.` : "")
    }[st.dela];
    const riket = P.tvilling ? (ar ? " Ihåliga punkter: riket i samma grupp." : " Streckade linjer: riket i samma grupp.") : "";
    return `${matt}, ${alder}${ar ? ", " + ar : ""}.${panel}${riket}` +
      (avkortad ? ` ${ar ? "Axeln" : "Y-axeln"} börjar på ${fmtTal(dom[0])}${andel ? " %" : ""}.` : "");
  }

  // Y-skala: delad för alla paneler. Anpassad = minsta spann + luft under;
  // nära noll tas nollan med. Hela = 0–100 % (eller indexets spann).
  function yDomän(varden) {
    const hela = andel ? [0, 100] : (data.skala || [0, d3.max(varden) || 1]);
    if (st.skala === "hela" || !varden.length) return { dom: hela, avkortad: false };
    let lo = d3.min(varden), hi = d3.max(varden);
    const minSpann = andel ? 20 : (data.skala ? 6 : (hi - lo) || 1);
    const spann = Math.max(hi - lo, minSpann);
    const mitt = (lo + hi) / 2;
    if (hi - lo < minSpann) { lo = mitt - spann / 2; hi = mitt + spann / 2; }
    lo = lo - spann * 0.25; hi = hi + spann * 0.12;
    if (andel && lo < 15) lo = 0;
    lo = Math.max(lo, hela[0]); hi = Math.min(hi, hela[1]);
    const s = d3.scaleLinear().domain([lo, hi]).nice(5);
    let [a, b] = s.domain();
    a = Math.max(a, hela[0]); b = Math.min(b, hela[1]);
    return { dom: [a, b], avkortad: a > hela[0] };
  }

  // Dela upp punkterna i sammanhängande delar: bryt vid saknat år och vid tidsseriebrott
  function segmentera(pts) {
    const brott = data.brott_ar;
    const delar = []; let cur = [];
    pts.forEach((q, k) => {
      const fore = pts[k - 1];
      const fortsatt = fore && data.ar.indexOf(q.ar) === data.ar.indexOf(fore.ar) + 1 && !(brott && fore.ar < brott && q.ar >= brott);
      if (!fortsatt && cur.length) { delar.push(cur); cur = []; }
      cur.push(q);
    });
    if (cur.length) delar.push(cur);
    return delar;
  }

  // ===========================================================================
  // TOOLTIP: tabell med värde och konfidensintervall, Halland mot riket (eller
  // kommunen mot Halland), skillnaden och förändringen sedan föregående år.
  // Verktygstipset prövar inga skillnader: om en skillnad är statistiskt
  // säkerställd står bara i testtabellen ovanför diagrammet (steg 12).
  // ===========================================================================
  const harKi = (d) => synlig(d) && d.l != null && d.h != null;
  const fmtDiff = (v) => {
    const r = Math.round(Math.abs(v) * 10 ** dec) / 10 ** dec;
    return r === 0 ? "±0" : `${v > 0 ? "+" : "−"}${fmtTal(r, dec)}`;
  };
  const ENHET_DIFF = andel ? "procentenheter" : "poäng";
  // Närmast föregående år med värde, utan tidsseriebrott emellan
  function foregaende(ar, geo, gt, g) {
    const i = data.ar.indexOf(ar);
    for (let j = i - 1; j >= 0; j--) {
      const f = data.ar[j];
      if (data.brott_ar && f < data.brott_ar && ar >= data.brott_ar) return null;
      if (synlig(rad(f, geo, gt, g))) return f;
    }
    return null;
  }

  // rader: [{ namn, farg, hal, a, b, nu, f }]; a = värdet i kolA, b = jämförelsen,
  // nu/f = värdet i år och föregående år för förändringskolumnen
  function tipHtml({ rubrik, under, kolA, kolB = null, diffRubrik = "Skillnad", fokus = null, foreRubrik = null, rader, fot = "" }) {
    const visaB = kolB != null && rader.some(r => r.b);
    const visaDiff = diffRubrik && rader.some(r => synlig(r.a) && synlig(r.b));
    const visaF = foreRubrik && rader.some(r => synlig(r.nu) && synlig(r.f));
    const cell = (d, fet) => !d ? `<td class="hlv-tt-tom">–</td>`
      : !synlig(d) ? `<td class="hlv-tt-tom">för få svar</td>`
      : `<td${fet ? ' class="hlv-tt-fokus"' : ""}><span class="hlv-tt-v">${fmtVE(d.v)}</span>${harKi(d) ? `<span class="hlv-tt-ki">${fmtV(d.l)}–${fmtV(d.h)}</span>` : ""}</td>`;
    const diff = (a, b) => !synlig(a) || !synlig(b) ? `<td class="hlv-tt-tom">–</td>`
      : `<td class="hlv-tt-diff">${fmtDiff(a.v - b.v)}</td>`;
    const th = (t, f) => `<th${f ? ' class="hlv-tt-fokus"' : ""}>${t}</th>`;
    const huvud = `<th></th>${th(kolA, fokus === kolA && visaB)}${visaB ? th(kolB, fokus === kolB) : ""}${visaDiff ? th(diffRubrik) : ""}${visaF ? th(foreRubrik) : ""}`;
    const kropp = rader.map(r => `<tr><td class="hlv-tt-namn"><span class="hlv-tt-prick${r.hal ? " hlv-tt-prick--hal" : ""}" style="--farg:${r.farg}"></span>${r.namn}</td>` +
      `${cell(r.a, fokus === kolA && visaB)}${visaB ? cell(r.b, fokus === kolB) : ""}${visaDiff ? diff(r.a, r.b) : ""}${visaF ? diff(r.nu, r.f) : ""}</tr>`).join("");
    const forklaring = [`Små siffror: 95 % konfidensintervall.`,
      visaDiff || visaF ? `Skillnader i ${ENHET_DIFF}. Om de är statistiskt säkerställda står i tabellen ovanför diagrammet.` : null,
      fot || null].filter(Boolean).join(" ");
    return `<div class="hlv-tt"><div class="hlv-tt-rubrik"><span class="hlv-tt-ar">${rubrik}</span><span class="hlv-tt-under">${under}</span></div>` +
      `<table class="hlv-tt-tabell"><thead><tr>${huvud}</tr></thead><tbody>${kropp}</tbody></table>` +
      `<div class="hlv-tt-fot">${forklaring}</div></div>`;
  }
  const antalText = (d, geo) => d && d.n != null ? `${geo} ${fmtTal(d.n)}` : null;

  // Tooltip för en panel i de fasta vyerna: valda serier, panelens område mot jämförelsen
  function tidTip(p, ar) {
    const geoA = p.kommun ? p.geo : "Halland";
    const geoB = p.kommun ? "Halland" : (harRiket ? "Riket" : null);
    const geoF = p.geo;                                   // förändringen gäller panelens område
    const a = p.alder || null;
    const valda = st.dela === "kommun" ? ["Totalt"] : KON.filter(k => st.serier[k]);
    const t0 = gtg(valda[0], a);
    const fore = foregaende(ar, geoF, t0.gt, t0.g);
    const rader = valda.map(k => {
      const t = gtg(k, a);
      return { namn: k, farg: SERIE[k].farg, a: rad(ar, geoA, t.gt, t.g), b: geoB ? rad(ar, geoB, t.gt, t.g) : null,
        nu: rad(ar, geoF, t.gt, t.g), f: fore ? rad(fore, geoF, t.gt, t.g) : null };
    });
    const grupp = a ? `${a} år` : "16–84 år";
    const n = [antalText(rader[0].a, geoA), geoB ? antalText(rader[0].b, geoB === "Riket" ? "riket" : geoB) : null].filter(Boolean);
    return tipHtml({ rubrik: String(ar), under: p.kommun ? `${p.geo}, ${grupp}` : grupp, kolA: geoA, kolB: geoB,
      diffRubrik: geoB ? "Skillnad" : null,
      fokus: p.geo, foreRubrik: fore ? `Sedan ${fore}${geoF !== geoA ? " (riket)" : ""}` : null, rader,
      fot: n.length ? `Svarande (${valda[0].toLowerCase()}): ${n.join(", ")}.` : "" });
  }
  // Tooltip i egen jämförelse: alla grupper, skillnaden mot den första
  function egenTip(serier, ar, fokusNamn = null) {
    const bas = serier[0], db = rad(ar, bas.geo, bas.gt, bas.g);
    const rader = serier.map((s, i) => {
      const fore = foregaende(ar, s.geo, s.gt, s.g);
      return { namn: s.namn + (s.namn === fokusNamn ? " ◂" : ""), farg: s.farg, hal: s.hal, a: rad(ar, s.geo, s.gt, s.g), b: i ? db : null,
        nu: rad(ar, s.geo, s.gt, s.g), f: fore ? rad(fore, s.geo, s.gt, s.g) : null, fore };
    });
    const foreAr = [...new Set(rader.filter(r => r.fore).map(r => r.fore))];
    return tipHtml({ rubrik: String(ar), under: "Egen jämförelse", kolA: "Värde",
      diffRubrik: serier.length > 1 ? "Skillnad" : null,
      foreRubrik: foreAr.length === 1 ? `Sedan ${foreAr[0]}` : (foreAr.length ? "Sedan förra" : null), rader,
      fot: serier.length > 1 ? `Skillnad mot ${bas.namn} (den första gruppen i listan).` : "" });
  }

  // Lägg tooltipen intill en ruta i SVG:n (hårkorset eller en rad) utan att täcka den.
  // lage "sida": till höger eller vänster om rutan; annars ovanför eller under.
  function placeraTip(svgNode, W, ruta, lage = "sida") {
    const node = tooltip.el.node(), body = ram.body.node();
    const b = body.getBoundingClientRect(), s = svgNode.getBoundingClientRect();
    const c = ram.container.node().getBoundingClientRect();
    const k = s.width / W, ox = s.left - b.left, oy = s.top - b.top;
    const x0 = ox + ruta.x0 * k, x1 = ox + ruta.x1 * k, y0 = oy + ruta.y0 * k, y1 = oy + ruta.y1 * k;
    const minX = Math.max(c.left, 0) - b.left + 4, maxX = Math.min(c.right, document.documentElement.clientWidth) - b.left - 4;
    node.style.maxWidth = `${Math.round(Math.min(440, Math.max(220, maxX - minX)))}px`;   // aldrig bredare än figurrutan
    const w = node.offsetWidth, h = node.offsetHeight, luft = 16;
    const minY = Math.max(c.top, 0) - b.top + 4, maxY = Math.min(c.bottom, window.innerHeight) - b.top - 4;
    const hoger = x1 + luft, vanster = x0 - luft - w;
    const fårHoger = hoger + w <= maxX, fårVanster = vanster >= minX;
    let left, top;
    if (lage === "sida" && (fårHoger || fårVanster)) {
      left = fårHoger && (!fårVanster || (x0 + x1) / 2 < (minX + maxX) / 2) ? hoger : vanster;
      top = Math.max(minY, Math.min(maxY - h, (y0 + y1) / 2 - h / 2));
    } else {
      left = Math.max(minX, Math.min(maxX - w, (x0 + x1) / 2 - w / 2));
      const ovan = y0 - luft - h, under = y1 + luft;
      top = ovan >= minY || under + h > maxY && ovan > minY - h / 2 ? ovan : under;
    }
    node.style.left = `${Math.round(left)}px`;
    node.style.top = `${Math.round(top)}px`;
  }
  function visaTip(html, svgNode, W, ruta, lage) {
    tooltip.visa(html, { x: 0, y: 0 });
    placeraTip(svgNode, W, ruta, lage);
  }

  // ===========================================================================
  // ÖVER TID: små multiplar (eller en panel)
  // ===========================================================================
  // tip: egen funktion (panel, år) -> html för verktygstipset (nivådiagrammen)
  function ritaTid({ P = paneler(), mal = ram.svgWrap, W = ritW(), sub = null, egen = false, tip = null } = {}) {
    const pan = P.lista;
    const smal = W < 600;
    const ensam = pan.length === 1;
    const gs = P.grupp || 1;
    // Vänstermarginalen: den bredaste y-etiketten + 12 px (hosrapportens regel)
    const gutter = (smal ? 8 : 12) + matText(andel ? "100 %" : "00,0", { size: smal ? 11.5 : 13 }), gapInre = smal ? 10 : 14, gapYttre = smal ? 18 : 34;
    const titelH = ensam && !pan[0].titel ? 0 : 24, xAxelH = ensam ? 30 : 26, radGap = 18;
    const kolH = P.kolRubriker ? 20 : 0;
    const etStorlek = smal ? 12 : ETIKETT.storlek;

    // Etikettkolumnen till höger: så bred som den bredaste etiketten. Bara
    // namnet står vid linjen; värdena finns i tabellen och verktygstipset.
    const etikettText = (s) => kort(s.kortNamn || s.namn, smal ? 16 : (egen ? 24 : 26));
    const textW = d3.max(pan.flatMap(p => p.serier), s => matText(etikettText(s), { size: etStorlek, weight: 600 })) || 40;
    const hoger = Math.min(smal ? 118 : (egen ? 190 : 230), textW + 26);

    // Kolumner: så många att panelerna blir minst ~175 px breda (par: 150 px)
    const tillg = W - gutter - hoger;
    const bredd = (c) => { const G = Math.ceil(c / gs); return (tillg - (G - 1) * gapYttre - (c - G) * gapInre) / c; };
    let cols = gs;
    if (ensam) cols = 1;
    else if (P.cols) cols = smal && gs === 1 ? 1 : P.cols;   // Halland | riket staplas på mobil
    else {
      const minPw = smal ? 118 : (gs === 2 ? 150 : 175);
      const maxC = Math.ceil(pan.length / gs) * gs;
      for (let c = Math.min(gs * 4, maxC); c >= gs; c -= gs) if (bredd(c) >= minPw) { cols = c; break; }
    }
    const rows = Math.ceil(pan.length / cols);
    const pw = bredd(cols);
    // Höjden följer bredden: små multiplar nära kvadratiska, en ensam panel bredare
    const ph = egen ? Math.max(220, Math.min(380, pw * 0.72))
      : ensam ? Math.max(smal ? 220 : 300, Math.min(460, W * 0.5))
      : Math.max(smal ? 112 : 140, Math.min(310, pw * (gs === 2 ? 0.88 : 0.8)));
    const colX = (c) => { const gi = Math.floor(c / gs); return gutter + c * pw + gi * gapYttre + (c - gi) * gapInre; };
    // Årtal bara under den nedersta panelen i varje kolumn (Datawrapper 2024)
    const arEtikett = (i) => i + cols >= pan.length;
    const radH = (r) => titelH + ph + (pan.some((p, i) => Math.floor(i / cols) === r && arEtikett(i)) ? xAxelH : 6) + radGap;
    const radY = (r) => d3.sum(d3.range(r), radH);
    const topp = kolH + (titelH ? 4 : 14);
    const H = topp + radY(rows) - radGap + 4;

    // Alla synliga värden (för den delade skalan)
    const varden = [];
    pan.forEach(p => p.serier.forEach(s => data.ar.forEach(a => { const d = rad(a, s.geo, s.gt, s.g); if (synlig(d)) varden.push(d.v); })));
    const { dom, avkortad } = yDomän(varden);
    const x = d3.scaleLinear().domain([2013, 2027]).range([0, pw]);
    const y = d3.scaleLinear().domain(dom).range([ph, 0]);
    const yt = y.ticks(ph >= 220 ? 5 : 4);

    const svg = mal.append("svg").attr("class", "graf-svg").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
    const brott = data.brott_ar;
    const harBrott = brott && data.ar.some(a => a < brott);
    const pos = (i) => ({ c: i % cols, r: Math.floor(i / cols) });

    // Kolumnrubriker i rutnätet (HALLAND | RIKET)
    if (P.kolRubriker) d3.range(cols).forEach(c => svg.append("text")
      .attr("x", colX(c)).attr("y", 12).attr("font-family", TYP.ui).attr("font-size", 10.5).attr("font-weight", 600)
      .attr("letter-spacing", "0.06em").attr("fill", FARG.text).text(P.kolRubriker[c % gs].toUpperCase()));

    // Direktetiketter i den första panelen längst till höger i en rad som har data
    const harData = (p) => p.serier.some(s => !s.ref && finnsSerie(s.geo, s.gt, s.g));
    const etikettIndex = (() => {
      const sist = pan.map((p, i) => i).filter(i => i % cols === cols - 1 || i === pan.length - 1);
      const i = sist.find(j => harData(pan[j]));
      return i == null ? sist[0] : i;
    })();

    pan.forEach((p, i) => {
      const { c, r } = pos(i);
      const px = colX(c), py = topp + radY(r) + titelH;
      const g = svg.append("g").attr("transform", `translate(${px},${py})`);
      if (p.titel) {
        // Bocken före namnet: textens bredd går inte att mäta innan diagrammet syns
        if (p.bock) bock(svg, px + 6, py - 13.5, 6);
        svg.append("text").attr("x", px + (p.bock ? 17 : 0)).attr("y", py - 9).attr("font-family", TYP.ui).attr("font-size", 13)
          .attr("font-weight", 650).attr("fill", FARG.ink).text(p.titel);
      }

      // Grid och axlar
      // Bara vågräta stödlinjer, streckade; ingen y-axellinje (hosrapportens grafspråk)
      const axelText = ensam && !smal ? 13 : 11.5;
      yt.forEach(t => g.append("line").attr("x1", 0).attr("x2", pw).attr("y1", y(t)).attr("y2", y(t))
        .attr("stroke", AXEL.grid).attr("stroke-width", 0.8).attr("stroke-dasharray", "4,4").attr("shape-rendering", "crispEdges"));
      if (c === 0) {
        yt.forEach(t => g.append("text").attr("x", -10).attr("y", y(t)).attr("dy", "0.32em").attr("text-anchor", "end")
          .attr("font-family", TYP.ui).attr("font-size", axelText).attr("fill", AXEL.text).style("font-variant-numeric", "tabular-nums")
          .text(andel ? `${fmtTal(t)} %` : fmtTal(t)));
        if (avkortad) g.append("path").attr("d", `M-6,${ph - 3} l4,-4 l4,4 l4,-4`).attr("fill", "none").attr("stroke", FARG.text).attr("stroke-width", 1.1);
      }
      g.append("line").attr("x1", 0).attr("x2", pw).attr("y1", ph).attr("y2", ph).attr("stroke", AXEL.linje).attr("shape-rendering", "crispEdges");
      const kortAr = pw < 170;
      XAR.forEach(a => {
        g.append("line").attr("x1", x(a)).attr("x2", x(a)).attr("y1", ph).attr("y2", ph + 5).attr("stroke", AXEL.linje);
        if (arEtikett(i)) g.append("text").attr("x", x(a)).attr("y", ph + (ensam ? 20 : 17)).attr("text-anchor", "middle").attr("font-family", TYP.ui)
          .attr("font-size", kortAr ? 10.5 : axelText).attr("fill", data.ar.includes(a) ? AXEL.text : FARG.mjuk)
          .text(kortAr ? `’${String(a).slice(2)}` : a);
      });
      if (p.riketPanel && !p.serier.some(s => finnsSerie(s.geo, s.gt, s.g)))
        g.append("text").attr("x", pw / 2).attr("y", ph / 2).attr("text-anchor", "middle").attr("font-family", TYP.ui)
          .attr("font-size", 11).attr("fill", FARG.mjuk).text("Ingen uppgift för riket");

      // Ritordning: referens, riket, kön, totalt överst. Först alla linjer, sedan alla punkter.
      const lager = (q) => q.ref ? 0 : q.riket ? 1 : q.namn === "Totalt" ? 3 : 2;
      const ordning = [...p.serier].sort((a, b) => lager(a) - lager(b))
        .map(s => ({ s, pts: data.ar.map(a => ({ ar: a, d: rad(a, s.geo, s.gt, s.g) })).filter(q => synlig(q.d)) }))
        .filter(o => o.pts.length);
      ordning.forEach(({ s, pts }) => segmentera(pts).forEach(del => {
        if (del.length > 1) g.append("path").datum(del).attr("fill", "none").attr("stroke", s.farg).attr("stroke-width", s.bredd)
          .attr("stroke-linejoin", "round").attr("stroke-linecap", s.streck ? "butt" : "round").attr("stroke-dasharray", s.streck || null)
          .attr("d", d3.line().x(q => x(q.ar)).y(q => y(q.d.v)));
      }));
      // Punkterna med vit ring; den sista punkten i varje serie är något större
      ordning.forEach(({ s, pts }) => pts.forEach((q, k) =>
        markor(g, x(q.ar), y(q.d.v), s.form, s.farg, k === pts.length - 1 && !s.hal ? s.r * 1.4 : s.r, s.hal)));

      // Direktetiketter: bara namnet, i värdeordning, med en tunn grå hake till
      // linjeänden (hosrapportens etiketter). Kolliderande etiketter slås ihop
      // och centreras kring linjeändarnas medelvärde.
      if (i === etikettIndex) {
        const poster = ordning.map(({ s, pts }) => {
          const q = pts[pts.length - 1];
          return { s, x: x(q.ar), ideal: y(q.d.v), v: q.d.v };
        });
        const ovre = r === 0 ? -(py - 6) : -titelH + 2;
        placeraEtiketter(poster, smal ? 15 : ETIKETT.avstand, ovre, ph + 8);
        const sistaX = d3.max(poster, e => e.x) || pw;
        const lx = Math.max(sistaX + 21, pw + 8);
        const et = g.append("g").attr("class", "hlv-etiketter");
        poster.forEach(e => {
          const x0 = e.x + (e.s.r ? e.s.r * 1.4 : 0) + 4;
          et.append("path").attr("d", `M${x0},${e.ideal}H${lx - 9}V${e.y}H${lx - 3}`)
            .attr("fill", "none").attr("stroke", ETIKETT.hake).attr("stroke-width", 0.6);
          et.append("text").attr("x", lx).attr("y", e.y).attr("dy", "0.35em").attr("font-family", TYP.ui).attr("font-size", etStorlek)
            .attr("font-weight", e.s.ref || e.s.riket ? 400 : 600)
            .attr("fill", e.s.ref ? ETIKETT.ref : textFarg(e.s.farg)).text(etikettText(e.s));
        });
      }

      // Hårkors och tooltip bara i den här panelen; punkterna för året förstoras
      const hair = g.append("line").attr("y1", -4).attr("y2", ph).attr("stroke", "#9aa09d").attr("stroke-width", 1)
        .attr("pointer-events", "none").style("display", "none");
      const fokus = g.append("g").attr("pointer-events", "none");
      const visa = (event) => {
        const [mx] = d3.pointer(event);
        const ar = data.ar.reduce((b, a) => Math.abs(x(a) - mx) < Math.abs(x(b) - mx) ? a : b, data.ar[0]);
        hair.style("display", null).attr("x1", x(ar)).attr("x2", x(ar));
        fokus.selectAll("*").remove();
        [...p.serier].sort((a, b) => lager(a) - lager(b)).forEach(s => {
          const d = rad(ar, s.geo, s.gt, s.g);
          if (synlig(d)) markor(fokus, x(ar), y(d.v), "cirkel", s.farg, s.ref ? 3 : s.r + 1.9, s.hal);
        });
        visaTip(tip ? tip(p, ar) : egen ? egenTip(p.serier, ar) : tidTip(p, ar), svg.node(), W, { x0: px + x(ar), x1: px + x(ar), y0: py, y1: py + ph }, "sida");
      };
      g.append("rect").attr("x", -6).attr("y", -4).attr("width", pw + 12).attr("height", ph + 8).attr("fill", "transparent")
        .style("cursor", "crosshair")
        .on("pointermove", visa).on("pointerdown", visa)
        .on("pointerleave", () => { hair.style("display", "none"); fokus.selectAll("*").remove(); tooltip.dolj(); });
    });

    // Ett ensamt diagram har namnen vid linjerna och behöver ingen förklaring
    // ovanför (som i hosrapporten). Rutnät av paneler behåller den.
    if (!egen && !tip) { if (ensam) legend([]); else legendSerier(P); }
    const undertext = sub ? sub + (avkortad ? ` Y-axeln börjar på ${fmtTal(dom[0])}${andel ? " %" : ""}.` : "") : undertitel(P, avkortad, dom);
    ram.setSubtitle(undertext);
    const fot = [KALLA,
      harBrott ? `Linjen bryts före ${brott}: ${data.brott_text}` : null,
      data.ar[0] > 2014 ? `Indikatorn kan beräknas från ${data.ar[0]}.` : null,
      pan.some(p => p.serier.some(s => s.geo === "Riket")) ? "Riket finns för 2022 och 2026." : null,
      syntetisk ? "OBS: SYNTETISK TESTDATA." : null].filter(Boolean).join(" ");
    ram.setCaption(fot);
    sattTabell(TABELLHUVUD, tabellRader(pan, data.ar));
    verktyg(svg, W, H, undertext, fot);
  }

  // ===========================================================================
  // ETT ÅR: punktdiagram (frågan finns bara ett år). Riket alltid som ihålig
  // tvilling på samma rad, förbunden med Hallands punkt.
  // ===========================================================================
  function ritaEttAr({ P = paneler({ tvillingAlltid: true }), mal = ram.svgWrap, W = ritW(), sub = null, egen = false, tip = null } = {}) {
    const ar = indAr[0];
    const pan = P.lista;
    const smal = W < 600;
    const antalSerier = d3.max(pan, p => p.serier.filter(s => !s.ref && !s.riket).length) || 1;
    const mL = smal ? 118 : (egen ? 190 : 160), mR = 70, mT = 30, radH = antalSerier > 1 ? 18 + antalSerier * 13 : 30;
    const H = mT + pan.length * radH + 30;
    const varden = [];
    pan.forEach(p => p.serier.forEach(s => { const d = rad(ar, s.geo, s.gt, s.g); if (synlig(d)) varden.push(d.v); }));
    const { dom, avkortad } = yDomän(varden);
    const x = d3.scaleLinear().domain(dom).range([mL, W - mR]);
    const svg = mal.append("svg").attr("class", "graf-svg").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
    x.ticks(smal ? 4 : 6).forEach(t => {
      svg.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", mT - 8).attr("y2", H - 28).attr("stroke", "#e3e5e4").attr("stroke-dasharray", "2,3");
      svg.append("text").attr("x", x(t)).attr("y", H - 12).attr("text-anchor", "middle").attr("font-family", TYP.ui).attr("font-size", 11.5)
        .attr("fill", FARG.text).text(andel ? `${fmtTal(t)} %` : fmtTal(t));
    });
    pan.forEach((p, i) => {
      const cy = mT + i * radH + radH / 2;
      const bakgrund = svg.append("rect").attr("x", 0).attr("y", cy - radH / 2).attr("width", W).attr("height", radH).attr("rx", 6).attr("fill", "transparent");
      if (i) svg.append("line").attr("x1", 0).attr("x2", W).attr("y1", cy - radH / 2).attr("y2", cy - radH / 2).attr("stroke", "#f0f1f0");
      const namnText = svg.append("text").attr("x", mL - 14).attr("y", cy).attr("dy", "0.35em").attr("text-anchor", "end").attr("font-family", TYP.ui)
        .attr("font-size", smal ? 11.5 : 12.5).attr("font-weight", 600).attr("fill", FARG.ink).text(kort(p.titel || p.etikett, egen ? 28 : 22));
      if (p.bock) { namnText.attr("x", mL - 30); bock(svg, mL - 20, cy, 6); }
      p.serier.filter(s => s.ref).forEach(s => {
        const d = rad(ar, s.geo, s.gt, s.g); if (!synlig(d)) return;
        svg.append("line").attr("x1", x(d.v)).attr("x2", x(d.v)).attr("y1", cy - radH / 2 + 5).attr("y2", cy + radH / 2 - 5)
          .attr("stroke", s.farg).attr("stroke-width", 1.6).attr("stroke-linecap", "round");
      });
      const egna = p.serier.filter(s => !s.ref && !s.riket);
      const markorer = svg.append("g");
      egna.forEach((s, k) => {
        const dy = (k - (egna.length - 1) / 2) * 13;
        const d = rad(ar, s.geo, s.gt, s.g);
        const rs = p.serier.find(q => q.riket && q.bas === s);
        const dr = rs && rad(ar, rs.geo, rs.gt, rs.g);
        if (synlig(d) && synlig(dr)) svg.append("line").attr("x1", x(d.v)).attr("x2", x(dr.v)).attr("y1", cy + dy).attr("y2", cy + dy)
          .attr("stroke", s.farg).attr("stroke-width", 1.4).attr("stroke-opacity", 0.4).attr("stroke-linecap", "round");
        if (synlig(dr)) markor(markorer, x(dr.v), cy + dy, "cirkel", rs.farg, s.r + 0.6, true);
        if (synlig(d)) markor(markorer, x(d.v), cy + dy, "cirkel", s.farg, s.r + 0.9, s.hal);
      });
      const hs = huvudserie(p), tot = hs && rad(ar, hs.geo, hs.gt, hs.g);
      if (synlig(tot)) svg.append("text").attr("x", W - mR + 10).attr("y", cy).attr("dy", "0.35em").attr("font-family", TYP.ui)
        .attr("font-size", 12).attr("font-weight", 600).attr("fill", FARG.ink).text(fmtVE(tot.v));
      const band = svg.append("rect").attr("x", 0).attr("y", cy - radH / 2).attr("width", W).attr("height", radH).attr("fill", "transparent");
      band.on("pointermove pointerdown", () => {
        bakgrund.attr("fill", "#f3f5f4");
        const html = tip ? tip(p, ar) : egen ? egenTip(P.lista.map(q => q.serier[0]), ar, hs && hs.namn) : tidTip(p, ar);
        visaTip(html, svg.node(), W, { x0: mL, x1: W - mR, y0: cy - radH / 2, y1: cy + radH / 2 }, "ovanunder");
      }).on("pointerleave", () => { bakgrund.attr("fill", "transparent"); tooltip.dolj(); });
    });
    if (!egen && !tip) legendSerier(P, true);
    const undertext = sub || undertitel(P, avkortad, dom, ar);
    ram.setSubtitle(undertext);
    const fot = `${KALLA} Frågan ställdes första gången ${ar}, så jämförelse över tid saknas.${syntetisk ? " OBS: SYNTETISK TESTDATA." : ""}`;
    ram.setCaption(fot);
    sattTabell(TABELLHUVUD, tabellRader(pan, [ar]));
    verktyg(svg, W, H, undertext, fot);
  }

  // ===========================================================================
  // NIVÅDIAGRAM: ett fast diagram per redovisningsnivå
  // ===========================================================================
  const MATT = andel ? "Andel i procent" : "Medelvärde, poäng";
  // Verktygstips i nivådiagrammen: varje serie med värde, intervall och antal
  function nivaTip(serier, ar, under) {
    const rader = serier.map(s => ({ namn: s.namn, farg: s.farg, hal: s.hal, a: rad(ar, s.geo, s.gt, s.g) }));
    const n = rader.filter(r => synlig(r.a) && r.a.n != null).map(r => `${r.namn} ${fmtTal(r.a.n)}`);
    return tipHtml({ rubrik: String(ar), under, kolA: "Värde", diffRubrik: null, rader,
      fot: [n.length ? `Svarande: ${n.join(", ")}.` : null, "Vilka skillnader som är statistiskt säkerställda står i tabellen ovanför diagrammet."].filter(Boolean).join(" ") });
  }
  const refSerie = (namn) => ({ ...SERIE.Halland, namn, geo: "Halland", gt: "Totalt", g: "Totalt", ref: true });
  const gruppSerier = (gt, grupper, namn) => grupper.filter(g => finnsSerie("Halland", gt, g))
    .map(g => ({ farg: NIVA_FARG[g], bredd: 1.8, r: 3.1, form: "cirkel", namn: namn(g), geo: "Halland", gt, g }));

  function ritaNiva() {
    if (niva === "regso") return ritaOmraden();
    if (niva === "kommun") {
      st.dela = "kommun"; st.serier = { Totalt: true, Kvinnor: false, "Män": false }; st.riket = "av";
      return ettAr ? ritaEttAr() : ritaTid();
    }
    const tot = { ...SERIE.Totalt, namn: "Halland", geo: "Halland", gt: "Totalt", g: "Totalt" };
    let serier, sub, under;
    if (niva === "lan") {
      serier = [tot];
      if (harRiket) serier.push({ ...tot, ...RIKET_STIL, r: Math.max(2.5, tot.r - 0.3), geo: "Riket", riket: true, bas: tot, namn: "Riket" });
      sub = `${MATT}, 16–84 år.${harRiket ? (ettAr ? " Ihålig punkt: riket." : " Streckad linje med ihåliga punkter: riket, som finns för 2022 och 2026.") : ""}`;
      under = "16–84 år";
    } else if (niva === "kon") {
      serier = [refSerie("Alla"), ...["Kvinnor", "Män"].map(k => ({ ...SERIE[k], namn: k, geo: "Halland", ...gtg(k, null) }))];
      sub = `${MATT}, 16–84 år. Grå linje: alla.`;
      under = "16–84 år";
    } else if (niva === "alder") {
      serier = [refSerie("Alla 16–84 år"), ...gruppSerier("Ålder", ALDRAR, a => `${a} år`)];
      sub = ettAr ? `${MATT} per åldersgrupp. Grått streck: alla 16–84 år.`
        : `${MATT} per åldersgrupp. Grå linje: alla 16–84 år. Gruppen 85+ finns från 2022.`;
      under = "Åldersgrupper";
    } else if (niva === "utbildning") {
      serier = gruppSerier("Utbildning", UTBILDNING, g => g);
      sub = `${MATT} efter högsta utbildning, 25–84 år${data.utbildning_standardiserad ? ", åldersstandardiserad: grupperna har räknats om till samma åldersfördelning" : ""}.`;
      under = "25–84 år";
    } else {
      serier = gruppSerier("Födelseland", FODELSE, g => g);
      sub = `${MATT}, 16–84 år.`;
      under = "16–84 år";
    }
    const egna = serier.filter(s => !s.ref && !s.riket);
    if (!egna.length && niva !== "lan") {
      ram.svgWrap.append("p").attr("class", "hlv-tom").text("För få svarande för att redovisa den här nivån.");
      return;
    }
    // Linjediagrammen har namnen vid linjeslutet och ingen förklaringsrad
    // (hosrapportens grafspråk); punktdiagrammet för ett år behåller den
    legend(ettAr ? serier.map(s => ({ namn: s.namn, farg: s.farg, bredd: s.ref ? 1.3 : s.bredd, form: s.ref ? "ingen" : s.form, hal: s.hal, streck: s.streck })) : []);
    const tip = (p, ar) => nivaTip(p.serier, ar, under);
    if (ettAr) {
      // Frågan finns bara ett år: en rad per grupp, alla som grå referenslinje
      const refs = serier.filter(s => s.ref);
      const P = niva === "lan" ? { lista: [{ titel: "Halland", etikett: "Halland", serier }] }
        : { lista: egna.map(s => ({ titel: s.namn, etikett: s.namn, serier: [...refs, s] })) };
      ritaEttAr({ P, sub: `${sub.replace("Grå linje", "Grått streck")} Avser ${indAr[0]}.`, tip: (p, ar) => nivaTip([...refs, ...p.serier.filter(s => !s.ref)], ar, under) });
    } else {
      ritaTid({ P: { lista: [{ titel: null, etikett: "Halland", serier }] }, sub, tip });
    }
  }

  // RegSO: ett område per rad, grupperat per kommun (norr till söder) och
  // sorterat efter värde. Punkten är skattningen, strecket 95 % KI, den
  // streckade lodräta linjen länet. Färgen är testets utfall mot länet.
  function ritaOmraden() {
    const omrSk = sk.filter(d => d.gt === "RegSO");
    const ar = d3.max(omrSk, d => d.ar);
    const lan = rad(ar, "Halland", "Totalt", "Totalt");
    const namn = new Map(data.omraden.map(o => [o.kod, o]));
    const ut = utfallFor("regso", true);
    const rader = omrSk.filter(d => d.ar === ar && synlig(d)).map(d => ({ d, kod: d.g,
      namn: (namn.get(d.g) || {}).namn || d.g, kommun: (namn.get(d.g) || {}).kommun || "", u: ut[d.g] || "ej" }));
    const dolda = omrSk.filter(d => d.ar === ar && !synlig(d)).length;
    if (!rader.length) {
      ram.svgWrap.append("p").attr("class", "hlv-tom").text(`Inget område har tillräckligt många svarande (minst 100) för att redovisas ${ar}.`);
      return;
    }
    const ordning = (data.kommuner_ordning || []).filter(k => rader.some(r => r.kommun === k));
    const grupper = [...ordning, ...[...new Set(rader.map(r => r.kommun))].filter(k => !ordning.includes(k))]
      .map(k => ({ kommun: k, rader: rader.filter(r => r.kommun === k).sort((a, b) => b.d.v - a.d.v) }));

    const W = ritW(), smal = W < 600;
    const mL = smal ? 150 : 230, mR = 64, mT = 30, radH = 19, kommunH = 26, mB = 30;
    let y = mT;
    grupper.forEach(g => { g.y0 = y; y += kommunH; g.rader.forEach(r => { r.y = y + radH / 2; y += radH; }); y += 6; });
    const H = y + mB;
    const varden = rader.flatMap(r => [r.d.l, r.d.h]).concat(lan ? [lan.v] : []).filter(v => v != null);
    let [lo, hi] = d3.extent(varden);
    const pad = Math.max((hi - lo) * 0.08, andel ? 2 : 0.3);
    lo = Math.max(andel ? 0 : -Infinity, lo - pad); hi = Math.min(andel ? 100 : Infinity, hi + pad);
    const x = d3.scaleLinear().domain([lo, hi]).nice(6).range([mL, W - mR]);
    const svg = ram.svg(W, H);
    x.ticks(smal ? 4 : 6).forEach(t => {
      svg.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", mT - 6).attr("y2", H - mB + 4).attr("stroke", "#e3e5e4").attr("stroke-dasharray", "2,3");
      svg.append("text").attr("x", x(t)).attr("y", H - 10).attr("text-anchor", "middle").attr("font-family", TYP.ui).attr("font-size", 11.5)
        .attr("fill", FARG.text).text(andel ? `${fmtTal(t)} %` : fmtTal(t, 1));
    });
    if (lan) {
      svg.append("line").attr("x1", x(lan.v)).attr("x2", x(lan.v)).attr("y1", mT - 6).attr("y2", H - mB + 4)
        .attr("stroke", FARG.text).attr("stroke-width", 1.2).attr("stroke-dasharray", "4,3");
      svg.append("text").attr("x", x(lan.v)).attr("y", mT - 12).attr("text-anchor", "middle").attr("font-family", TYP.ui)
        .attr("font-size", 11.5).attr("font-weight", 600).attr("fill", FARG.ink).text(`Länet ${fmtVE(lan.v)}`);
    }
    grupper.forEach(g => {
      svg.append("text").attr("x", 0).attr("y", g.y0 + 17).attr("font-family", TYP.ui).attr("font-size", 13)
        .attr("font-weight", 650).attr("fill", FARG.ink).text(g.kommun);
      g.rader.forEach(r => {
        const f = UTFALL[r.u].farg;
        const bakgrund = svg.append("rect").attr("x", 0).attr("y", r.y - radH / 2).attr("width", W).attr("height", radH).attr("rx", 4).attr("fill", "transparent");
        svg.append("text").attr("x", mL - 12).attr("y", r.y).attr("dy", "0.35em").attr("text-anchor", "end").attr("font-family", TYP.ui)
          .attr("font-size", 12).attr("fill", FARG.ink).text(kort(r.namn, smal ? 20 : 32));
        if (r.d.l != null && r.d.h != null) svg.append("line").attr("x1", x(r.d.l)).attr("x2", x(r.d.h)).attr("y1", r.y).attr("y2", r.y)
          .attr("stroke", f).attr("stroke-width", 1.6).attr("stroke-opacity", 0.45).attr("stroke-linecap", "round");
        markor(svg, x(r.d.v), r.y, "cirkel", f, 4.2);
        if (UTFALL[r.u].sak) {
          bock(svg, W - mR + 16, r.y, 6);
          svg.append("text").attr("x", W - mR + 26).attr("y", r.y).attr("dy", "0.35em")
            .attr("font-family", TYP.ui).attr("font-size", 11.5).attr("font-weight", 600).attr("fill", FARG.ink).text(fmtVE(r.d.v));
        }
        svg.append("rect").attr("x", 0).attr("y", r.y - radH / 2).attr("width", W).attr("height", radH).attr("fill", "transparent")
          .on("pointermove pointerdown", () => {
            bakgrund.attr("fill", "#f3f5f4");
            const diff = lan ? r.d.v - lan.v : null;
            const html = `<div class="hlv-tt"><div class="hlv-tt-rubrik"><span class="hlv-tt-ar">${r.namn}</span><span class="hlv-tt-under">${r.kommun}, ${ar}</span></div>` +
              `<table class="hlv-tt-tabell"><thead><tr><th></th><th>Värde</th></tr></thead><tbody>` +
              `<tr><td class="hlv-tt-namn"><span class="hlv-tt-prick" style="--farg:${f}"></span>Området</td><td><span class="hlv-tt-v">${fmtVE(r.d.v)}</span><span class="hlv-tt-ki">${fmtV(r.d.l)}–${fmtV(r.d.h)}</span></td></tr>` +
              (lan ? `<tr><td class="hlv-tt-namn">Länet</td><td><span class="hlv-tt-v hlv-tt-v--mjuk">${fmtVE(lan.v)}</span></td></tr>` : "") +
              `</tbody></table><div class="hlv-tt-fot">${diff != null ? `Skillnad mot länet: ${fmtDiff(diff)} ${ENHET_DIFF}. ` : ""}` +
              `Testet: ${UTFALL[r.u].text}${UTFALL[r.u].sak ? " ✓" : ""}.${r.d.n != null ? ` ${fmtTal(r.d.n)} svarande.` : ""}</div></div>`;
            visaTip(html, svg.node(), W, { x0: mL, x1: W - mR, y0: r.y - radH / 2, y1: r.y + radH / 2 }, "ovanunder");
          })
          .on("pointerleave", () => { bakgrund.attr("fill", "transparent"); tooltip.dolj(); });
      });
    });
    legend([
      ...(rader.some(r => UTFALL[r.u].sak) ? [{ namn: "Statistiskt säkerställd skillnad mot länet (grön punkt)", farg: SAK_FARG, bredd: 0, bock: true }] : []),
      { namn: "Ingen statistiskt säkerställd skillnad (grå punkt)", farg: UTFALL.ingen.farg, bredd: 0, form: "cirkel" }]);
    const sub = `${MATT}, 16–84 år, ${ar}. En rad per område med minst ${100} svarande; strecket är 95 % konfidensintervall och den streckade linjen länets nivå.`;
    ram.setSubtitle(sub);
    const fot = [KALLA, `Områdena är SCB:s regionala statistikområden (RegSO), 2025 års indelning, efter adressen vid urvalsdragningen.`,
      dolda ? `${dolda} områden med färre än 100 svarande visas inte.` : null, syntetisk ? "OBS: SYNTETISK TESTDATA." : null].filter(Boolean).join(" ");
    ram.setCaption(fot);
    sattTabell(["Kommun", "Område", "Värde", "95 % KI, nedre", "95 % KI, övre", "Antal svarande", "Jämfört med länet"],
      grupper.flatMap(g => g.rader.map(r => [g.kommun, r.namn, fmtV(r.d.v), fmtV(r.d.l), fmtV(r.d.h), r.d.n, UTFALL[r.u].text])));
    verktyg(svg, W, H, sub, fot);
  }

  // ===========================================================================
  // EGEN JÄMFÖRELSE
  // Kolumnen till vänster bygger en serie av område × kön × ålder. Serien dras
  // till diagrammet eller läggs till med knappen. Valet delas av alla diagram.
  // ===========================================================================
  const avkoda = (nyckel) => {
    const [geo, kon, alder] = nyckel.split("|");
    const a = alder === "alla" ? null : alder;
    const grupp = [kon === "Totalt" ? (a ? null : "totalt") : kon.toLowerCase(), a ? `${a} år` : null].filter(Boolean).join(" ");
    return { geo, kon, alder, ...gtg(kon, a), namn: `${geo}, ${grupp}`, kortNamn: `${geo === "Halland" || geo === "Riket" ? geo : geo.slice(0, 10)}, ${grupp}` };
  };
  const tillganglig = (nyckel) => { const d = avkoda(nyckel); return finnsSerie(d.geo, d.gt, d.g); };
  const egenSerie = (val) => {
    const d = avkoda(val.nyckel);
    const riket = d.geo === "Riket";
    return { ...d, farg: val.farg, bredd: riket ? 1.4 : 1.8, r: 3.1, form: "cirkel",
      hal: riket, streck: riket ? RIKET_STIL.streck : null };
  };
  function laggTill(nyckel) {
    const finns = globalEgen.some(v => v.nyckel === nyckel);
    if (finns) return meddela("Gruppen finns redan i diagrammet.");
    if (globalEgen.length >= EGEN_MAX) return meddela(`Högst ${EGEN_MAX} grupper. Ta bort någon först.`);
    if (!tillganglig(nyckel)) return meddela("Gruppen saknas för den här indikatorn (frågan ställdes inte eller för få svarande).");
    const ledig = EGEN_FARGER.find(f => !globalEgen.some(v => v.farg === f));
    sattGlobalEgen([...globalEgen, { nyckel, farg: ledig }]);
    meddela(`${avkoda(nyckel).namn} lades till.`);
  }
  function taBort(nyckel) { sattGlobalEgen(globalEgen.filter(v => v.nyckel !== nyckel)); meddela(`${avkoda(nyckel).namn} togs bort.`); }
  let meddelandeEl = null;
  function meddela(t) { if (meddelandeEl) meddelandeEl.text(t); }
  const draBar = (el, nyckel) => el.attr("draggable", "true")
    .on("dragstart", (event) => { event.dataTransfer.setData("text/plain", nyckel); event.dataTransfer.effectAllowed = "copy"; ram.container.classed("hlv-drar", true); })
    .on("dragend", () => ram.container.classed("hlv-drar", false));
  const slappYta = (el) => el
    .on("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; el.classed("hlv-slapp-aktiv", true); })
    .on("dragleave", () => el.classed("hlv-slapp-aktiv", false))
    .on("drop", (event) => {
      event.preventDefault(); el.classed("hlv-slapp-aktiv", false); ram.container.classed("hlv-drar", false);
      const n = event.dataTransfer.getData("text/plain"); if (n) laggTill(n);
    });

  let byggDelar = {};
  function byggKolumn() {
    const b = byggEl;
    b.append("p").attr("class", "hlv-bygg-rubrik").text("Bygg egen jämförelse");
    b.append("p").attr("class", "hlv-bygg-hjalp").text("Välj område, kön och ålder. Dra gruppen till diagrammet eller tryck Lägg till.");
    const uid = `hlv-${data.id}-${Math.random().toString(36).slice(2, 7)}`;
    // Område
    const f1 = b.append("div").attr("class", "hlv-bygg-falt");
    f1.append("label").attr("for", `${uid}-geo`).text("Område");
    const geoSel = f1.append("select").attr("id", `${uid}-geo`).on("change", function () { st.bygg.geo = this.value; if (!["Halland", "Riket"].includes(this.value)) st.bygg.alder = "alla"; uppdateraBygg(); });
    geoSel.append("optgroup").attr("label", "Län och riket").selectAll("option").data(harRiket ? ["Halland", "Riket"] : ["Halland"]).join("option").attr("value", d => d).text(d => d);
    // Bara kommuner som har skattningar för indikatorn (norr till söder)
    if (kommuner.length) geoSel.append("optgroup").attr("label", "Kommuner, norr till söder").selectAll("option").data(kommuner).join("option").attr("value", d => d).text(d => d);
    // Kön
    const f2 = b.append("div").attr("class", "hlv-bygg-falt");
    f2.append("span").attr("class", "hlv-bygg-etikett").attr("id", `${uid}-kon`).text("Kön");
    const konWrap = f2.append("div").attr("class", "hlv-chips").attr("role", "radiogroup").attr("aria-labelledby", `${uid}-kon`);
    const konKnappar = KON.map(k => konWrap.append("button").attr("type", "button").attr("class", "hlv-chip").attr("role", "radio")
      .on("click", () => { st.bygg.kon = k; uppdateraBygg(); }).text(k));
    // Ålder
    const f3 = b.append("div").attr("class", "hlv-bygg-falt");
    f3.append("label").attr("for", `${uid}-alder`).text("Ålder");
    const alderSel = f3.append("select").attr("id", `${uid}-alder`).on("change", function () { st.bygg.alder = this.value; uppdateraBygg(); });
    alderSel.selectAll("option").data([{ v: "alla", t: "16–84 år (alla)" }, ...ALDRAR.map(a => ({ v: a, t: `${a} år` }))])
      .join("option").attr("value", d => d.v).text(d => d.t);
    const alderNot = f3.append("p").attr("class", "hlv-bygg-not");
    // Kandidaten: dra eller lägg till
    const kand = b.append("div").attr("class", "hlv-bygg-kandidat").attr("aria-hidden", "true");
    const laggKnapp = b.append("button").attr("type", "button").attr("class", "hlv-bygg-knapp")
      .on("click", () => laggTill(`${st.bygg.geo}|${st.bygg.kon}|${st.bygg.alder}`));
    meddelandeEl = b.append("p").attr("class", "hlv-bygg-meddelande").attr("aria-live", "polite");
    // I diagrammet
    const listRubrik = b.append("p").attr("class", "hlv-bygg-underrubrik");
    const listaEl = b.append("ul").attr("class", "hlv-bygg-lista");
    slappYta(listaEl);
    b.append("button").attr("type", "button").attr("class", "hlv-bygg-rensa").text("Rensa alla")
      .on("click", () => { sattGlobalEgen([]); meddela("Diagrammet är tömt."); });
    // Snabbval
    b.append("p").attr("class", "hlv-bygg-underrubrik").text("Snabbval");
    const snabb = b.append("div").attr("class", "hlv-bygg-snabb");
    [["Halland|Totalt|alla", "Halland"], ["Riket|Totalt|alla", "Riket"], ["Halland|Kvinnor|alla", "Halland, kvinnor"], ["Halland|Män|alla", "Halland, män"],
     ["Riket|Kvinnor|alla", "Riket, kvinnor"], ["Riket|Män|alla", "Riket, män"]].forEach(([n, t]) => {
      const knapp = snabb.append("button").attr("type", "button").attr("class", "hlv-chip hlv-chip--snabb").text(`+ ${t}`)
        .on("click", () => laggTill(n));
      draBar(knapp, n);
    });
    byggDelar = { geoSel, konKnappar, alderSel, alderNot, kand, laggKnapp, listRubrik, listaEl };
    slappYta(diagramEl);
  }
  function uppdateraBygg() {
    if (!byggEl) return;
    const { geoSel, konKnappar, alderSel, alderNot, kand, laggKnapp, listRubrik, listaEl } = byggDelar;
    const kommun = !["Halland", "Riket"].includes(st.bygg.geo);
    if (kommun) st.bygg.kon = "Totalt";
    geoSel.property("value", st.bygg.geo);
    konKnappar.forEach((k, i) => k.attr("aria-checked", KON[i] === st.bygg.kon ? "true" : "false").attr("aria-pressed", null)
      .property("disabled", kommun && KON[i] !== "Totalt"));
    alderSel.property("disabled", kommun).property("value", kommun ? "alla" : st.bygg.alder);
    alderNot.text(kommun ? "Kommunerna redovisas inte efter kön eller ålder." : "");
    const nyckel = `${st.bygg.geo}|${st.bygg.kon}|${kommun ? "alla" : st.bygg.alder}`;
    const d = avkoda(nyckel), ok = tillganglig(nyckel), redan = globalEgen.some(v => v.nyckel === nyckel);
    kand.selectAll("*").remove();
    kand.classed("hlv-bygg-kandidat--av", !ok || redan);
    kand.append("span").attr("class", "hlv-bygg-grepp").text("⠿");
    kand.append("span").text(d.namn);
    kand.on("dragstart", null).on("dragend", null).attr("draggable", null);
    if (ok && !redan && globalEgen.length < EGEN_MAX) draBar(kand, nyckel);
    laggKnapp.text(redan ? "Finns redan i diagrammet" : !ok ? "Saknas för indikatorn" : "Lägg till i diagrammet")
      .property("disabled", !ok || redan || globalEgen.length >= EGEN_MAX);
    listRubrik.text(`I diagrammet (${globalEgen.length} av ${EGEN_MAX})`);
    listaEl.selectAll("*").remove();
    if (!globalEgen.length) listaEl.append("li").attr("class", "hlv-bygg-tom").text("Släpp grupper här");
    globalEgen.forEach(v => {
      const s = egenSerie(v), li = listaEl.append("li").classed("hlv-bygg-saknas", !tillganglig(v.nyckel));
      markorIkon(li, s, 22);
      li.append("span").attr("class", "hlv-bygg-namn").text(s.namn + (tillganglig(v.nyckel) ? "" : " (saknas här)"));
      li.append("button").attr("type", "button").attr("class", "hlv-bygg-bort").attr("aria-label", `Ta bort ${s.namn}`).text("×")
        .on("click", () => taBort(v.nyckel));
    });
  }
  function ritaEgen() {
    if (!diagramEl) return;
    diagramEl.selectAll("*").remove();
    tooltip.dolj();
    // Diagrammet delar rutan med kolumnen: rita i den bredd det faktiskt får
    const W = window.matchMedia && window.matchMedia("(min-width: 760px)").matches ? 640 : ritW();
    const serier = globalEgen.filter(v => tillganglig(v.nyckel)).map(egenSerie);
    const matt = andel ? "Andel i procent" : "Medelvärde, poäng";
    if (!serier.length) {
      legend([]);
      diagramEl.append("div").attr("class", "hlv-egen-tom").text("Dra hit en grupp från kolumnen, eller tryck Lägg till.");
      ram.setSubtitle(`${matt}. Egen jämförelse.`);
      sattTabell(TABELLHUVUD, []);
      return;
    }
    legend(serier.map(s => ({ namn: s.namn, farg: s.farg, bredd: s.bredd, form: s.form, hal: s.hal, streck: s.streck })));
    const harRiketValt = serier.some(s => s.geo === "Riket");
    if (ettAr) {
      const P = { lista: serier.map(s => ({ titel: s.namn, etikett: s.namn, serier: [s] })) };
      ritaEttAr({ P, mal: diagramEl, W, egen: true, sub: `${matt}, ${indAr[0]}. Egen jämförelse.` });
    } else {
      const P = { lista: [{ titel: null, etikett: "Egen jämförelse", serier }] };
      ritaTid({ P, mal: diagramEl, W, egen: true,
        sub: `${matt}. Egen jämförelse${harRiketValt ? "; riket streckat (finns 2022 och 2026)" : ""}.` });
    }
  }

  // ===========================================================================
  // SVARSFÖRDELNING över tid: en sektion per grupp (16–84 år eller
  // åldersgrupp), inom den valda serier och Halland/riket
  // ===========================================================================
  function ritaFordelning() {
    const fragor = (data.fragor || []).filter(f => fo.some(d => d.fraga === f.id));
    if (!fragor.length) return;
    if (st.fraga >= fragor.length) st.fraga = 0;
    const fr = fragor[st.fraga];
    const namnFraga = (f) => {
      const del = f.delfragor && f.delfragor[f.id];
      const nr = (f.delnr && f.delnr[f.id]) || f.nr;
      return `${nr ? "Fråga " + nr + ": " : ""}${del || f.text}`;
    };
    if (fragor.length > 1) valPill(ram.controlsLeft, { label: "Fråga", options: fragor.map(f => kort(namnFraga(f), 52)), activeIndex: st.fraga, body: ram.body,
      onSelect: (i) => { st.fraga = i; rita(); } });
    const fd = fo.filter(d => d.fraga === fr.id);
    if (fr.typ === "flerval") return ritaFlerval(fr, fd, namnFraga(fr));

    const kat = [...new Map(fd.map(d => [d.kod, d.etikett || d.kod])).entries()]
      .sort((a, b) => +a[0] - +b[0]).map(([kod, etikett]) => ({ kod, etikett }));
    const ordnade = kat.filter(k => !VET_INTE.test(k.etikett));
    const ramp = d3.interpolateRgbBasis(["#123f37", "#2f7d6d", "#8fc2b4", "#e6dcb8", "#c79a3c", "#8a5a12"]);
    const farg = new Map(kat.map(k => [k.kod, VET_INTE.test(k.etikett) ? "#BFC3C1" :
      ramp(ordnade.length > 1 ? ordnade.indexOf(k) / (ordnade.length - 1) : 0.2)]));

    const valda = KON.filter(k => st.serier[k]);
    const medRiket = st.riket !== "av" && harRiketFo;
    const sektioner = st.dela === "alder" ? ALDRAR.map(a => ({ titel: `${a} år`, a })) : [{ titel: "16–84 år", a: null }];
    const geos = ["Halland", ...(medRiket ? ["Riket"] : [])];
    const grupper = sektioner.flatMap(sec => valda.flatMap(k => geos.map(geo => ({
      sektion: sec.titel, kon: k, geo, riket: geo === "Riket", ...gtg(k, sec.a),
      titel: `${k}${geo === "Riket" ? ", riket" : medRiket ? ", Halland" : ""}`
    })))).map(g => ({ ...g, ar: [...new Set(fd.filter(d => d.geo === g.geo && d.gt === g.gt && d.g === g.g).map(d => d.ar))].sort() }))
      .filter(g => g.ar.length);

    const W = ritW();
    const mL = 52, mR = 16, radH = 22, titelH = 20, sektH = 26, gapP = 10;
    let yPos = 4, forraSekt = null;
    const layout = grupper.map((g, k) => {
      const ny = g.sektion !== forraSekt; forraSekt = g.sektion;
      if (ny && k > 0) yPos += 8;
      const o = { ...g, nySektion: ny && (sektioner.length > 1 || k === 0), sektY: yPos + 16 };
      if (o.nySektion) yPos += sektH;
      o.y = yPos + titelH;
      const nasta = grupper[k + 1];
      yPos += titelH + g.ar.length * radH + (nasta && nasta.riket && nasta.kon === g.kon ? 2 : gapP);
      return o;
    });
    const H = yPos + 22;
    const x = d3.scaleLinear().domain([0, 100]).range([mL, W - mR]);
    const svg = ram.svg(W, H);
    [0, 25, 50, 75, 100].forEach(t => svg.append("text").attr("x", x(t)).attr("y", H - 8).attr("text-anchor", "middle")
      .attr("font-family", TYP.ui).attr("font-size", 11).attr("fill", FARG.text).text(`${t} %`));
    layout.forEach(g => {
      if (g.nySektion) svg.append("text").attr("x", 0).attr("y", g.sektY).attr("font-family", TYP.ui).attr("font-size", 13.5)
        .attr("font-weight", 700).attr("fill", FARG.ink).text(g.sektion);
      const t = svg.append("text").attr("x", 0).attr("y", g.y - 6).attr("font-family", TYP.ui).attr("font-size", 12)
        .attr("font-weight", g.riket ? 500 : 600).attr("fill", g.riket ? FARG.text : FARG.ink);
      t.text(g.titel);
      g.ar.forEach((a, k) => {
        const cy = g.y + k * radH + radH / 2;
        svg.append("text").attr("x", mL - 8).attr("y", cy).attr("dy", "0.35em").attr("text-anchor", "end").attr("font-family", TYP.ui)
          .attr("font-size", 11.5).attr("fill", FARG.text).text(a);
        const delar = fd.filter(d => d.geo === g.geo && d.gt === g.gt && d.g === g.g && d.ar === a);
        if (delar.every(d => d.u || d.v == null)) {
          svg.append("text").attr("x", mL + 4).attr("y", cy).attr("dy", "0.35em").attr("font-family", TYP.ui).attr("font-size", 11).attr("fill", FARG.mjuk).text("För få svarande");
          return;
        }
        let acc = 0;
        kat.forEach(kt => {
          const d = delar.find(dd => dd.kod === kt.kod);
          if (!d || d.u || d.v == null || d.v <= 0) return;
          const x0 = x(acc), x1 = x(acc + d.v); acc += d.v;
          svg.append("rect").attr("x", x0).attr("y", cy - 8).attr("width", Math.max(0, x1 - x0 - 1.5)).attr("height", 16).attr("rx", 1.5).attr("fill", farg.get(kt.kod))
            .on("pointermove pointerdown", () => visaTip(fordTip(g, a, kt, delar), svg.node(), W, { x0: mL, x1: W - mR, y0: cy - 9, y1: cy + 9 }, "ovanunder"))
            .on("pointerleave", () => tooltip.dolj());
          if (x1 - x0 > 26) svg.append("text").attr("x", (x0 + x1) / 2).attr("y", cy).attr("dy", "0.35em").attr("text-anchor", "middle")
            .attr("font-family", TYP.ui).attr("font-size", 10.5).attr("pointer-events", "none")
            .attr("fill", d3.hsl(farg.get(kt.kod)).l < 0.5 ? "#fff" : FARG.ink).text(fmtTal(d.v));
        });
      });
    });
    // Tooltip: hela fördelningen för stapeln, det utpekade alternativet markerat,
    // och samma alternativ i jämförelseområdet (riket eller Halland)
    function fordTip(g, a, kt, delar) {
      const annan = g.riket ? "Halland" : (harRiketFo ? "Riket" : null);
      const jmf = annan ? fd.filter(d => d.geo === annan && d.gt === g.gt && d.g === g.g && d.ar === a) : [];
      const rader = kat.map(k => {
        const d = delar.find(dd => dd.kod === k.kod), e = jmf.find(dd => dd.kod === k.kod);
        const ok = (q) => q && !q.u && q.v != null;
        const diff = ok(d) && ok(e) ? (g.riket ? e.v - d.v : d.v - e.v) : null;
        return `<tr${k.kod === kt.kod ? ' class="hlv-tt-rad-fokus"' : ""}><td class="hlv-tt-namn"><span class="hlv-tt-prick hlv-tt-prick--ruta" style="--farg:${farg.get(k.kod)}"></span>${k.etikett}</td>` +
          `<td><span class="hlv-tt-v">${ok(d) ? fmtTal(d.v) + " %" : "–"}</span></td>` +
          (jmf.length ? `<td><span class="hlv-tt-v hlv-tt-v--mjuk">${ok(e) ? fmtTal(e.v) + " %" : "–"}</span></td><td class="hlv-tt-diff">${diff == null ? "–" : fmtDiff(diff)}</td>` : "") + "</tr>";
      }).join("");
      const kolH = g.riket ? "Riket" : "Halland";
      const huvud = `<th></th><th class="hlv-tt-fokus">${kolH}</th>${jmf.length ? `<th>${annan}</th><th>Hal–riket</th>` : ""}`;
      const n = delar.find(d => d.n != null);
      return `<div class="hlv-tt"><div class="hlv-tt-rubrik"><span class="hlv-tt-ar">${a}</span><span class="hlv-tt-under">${g.sektion}, ${g.kon.toLowerCase()}</span></div>` +
        `<table class="hlv-tt-tabell"><thead><tr>${huvud}</tr></thead><tbody>${rader}</tbody></table>` +
        `<div class="hlv-tt-fot">${n ? `${fmtTal(n.n)} har besvarat frågan (${kolH === "Riket" ? "riket" : kolH}). ` : ""}${jmf.length ? `Skillnad i procentenheter. ` : ""}Andel av dem som besvarat frågan.</div></div>`;
    }
    legend(kat.map(k => ({ namn: k.etikett, farg: farg.get(k.kod), ruta: true })));
    const sub = `${mening(kort(namnFraga(fr), 130))} Andel i procent av dem som besvarat frågan, per år.`;
    ram.setSubtitle(sub);
    const fot = `${KALLA} Svarsalternativ med färre än 5 svarande visas inte. Svarsalternativens lydelse kan skilja sig något mellan åren, se frågebanken i metodkapitlet.${syntetisk ? " OBS: SYNTETISK TESTDATA." : ""}`;
    ram.setCaption(fot);
    sattTabell(["Grupp", "Serie", "År", "Svarsalternativ", "Andel, procent", "Antal svarande"],
      grupper.flatMap(g => g.ar.flatMap(a => kat.map(kt => { const d = fd.find(dd => dd.geo === g.geo && dd.gt === g.gt && dd.g === g.g && dd.ar === a && dd.kod === kt.kod); return [g.sektion, g.titel, a, kt.etikett, d && !d.u ? fmtTal(d.v, 1) : "–", d ? d.n : ""]; }))));
    verktyg(svg, W, H, sub, fot);
  }

  function ritaFlerval(fr, fd, rubrik) {
    const ar = d3.max(fd, d => d.ar);
    const alt = [...new Map(fd.filter(d => d.ar === ar).map(d => [d.kod, d.etikett || d.kod])).entries()];
    const hallandsGrupper = KON.filter(k => st.serier[k]).map(k => ({ namn: k, ...gtg(k, null), ...SERIE[k], geo: "Halland" }));
    const medRiket = st.riket !== "av" && fd.some(d => d.geo === "Riket" && d.ar === ar && !d.u);
    const grupper = [...hallandsGrupper, ...(medRiket ? hallandsGrupper.map(g => ({ ...g, geo: "Riket", hal: true, namn: `${g.namn}, riket` })) : [])];
    const hamta = (kod, gr) => fd.find(d => d.ar === ar && d.geo === gr.geo && d.gt === gr.gt && d.g === gr.g && d.kod === kod);
    alt.sort((a, b) => ((hamta(b[0], grupper[0]) || {}).v ?? -1) - ((hamta(a[0], grupper[0]) || {}).v ?? -1));
    const W = ritW(), smal = W < 600;
    const mL = smal ? 140 : 250, mR = 50, mT = 12, radH = 30;
    const H = mT + alt.length * radH + 30;
    const xmax = d3.max(fd.filter(d => d.ar === ar && !d.u), d => d.v) || 10;
    const x = d3.scaleLinear().domain([0, Math.min(100, xmax * 1.1)]).nice().range([mL, W - mR]);
    const svg = ram.svg(W, H);
    x.ticks(5).forEach(t => {
      svg.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", mT).attr("y2", H - 26).attr("stroke", FARG.grid).attr("stroke-dasharray", "3,3");
      svg.append("text").attr("x", x(t)).attr("y", H - 10).attr("text-anchor", "middle").attr("font-family", TYP.ui).attr("font-size", 11).attr("fill", FARG.text).text(`${t} %`);
    });
    alt.forEach(([kod, etikett], i) => {
      const cy = mT + i * radH + radH / 2;
      svg.append("text").attr("x", mL - 10).attr("y", cy).attr("dy", "0.35em").attr("text-anchor", "end").attr("font-family", TYP.ui).attr("font-size", 12).attr("fill", FARG.ink).text(kort(etikett, smal ? 22 : 38));
      svg.append("line").attr("x1", mL).attr("x2", W - mR).attr("y1", cy).attr("y2", cy).attr("stroke", "#eceeed");
      [...grupper].reverse().forEach(gr => { const d = hamta(kod, gr); if (d && !d.u && d.v != null) markor(svg, x(d.v), cy, gr.form, gr.farg, gr.r + 0.9, gr.hal); });
      // Tooltip: Halland och riket per grupp, med skillnaden
      const rader = hallandsGrupper.map(gr => {
        const ok = (q) => q && !q.u && q.v != null ? q : null;
        const a = ok(hamta(kod, gr)), b = medRiket ? ok(hamta(kod, { ...gr, geo: "Riket" })) : null;
        return `<tr><td class="hlv-tt-namn"><span class="hlv-tt-prick" style="--farg:${gr.farg}"></span>${gr.namn}</td>` +
          `<td><span class="hlv-tt-v">${a ? fmtTal(a.v) + " %" : "–"}</span></td>` +
          (medRiket ? `<td><span class="hlv-tt-v hlv-tt-v--mjuk">${b ? fmtTal(b.v) + " %" : "–"}</span></td><td class="hlv-tt-diff">${a && b ? fmtDiff(a.v - b.v) : "–"}</td>` : "") + "</tr>";
      }).join("");
      const html = `<div class="hlv-tt"><div class="hlv-tt-rubrik"><span class="hlv-tt-ar">${ar}</span><span class="hlv-tt-under">${etikett}</span></div>` +
        `<table class="hlv-tt-tabell"><thead><tr><th></th><th>Halland</th>${medRiket ? "<th>Riket</th><th>Skillnad</th>" : ""}</tr></thead><tbody>${rader}</tbody></table>` +
        `<div class="hlv-tt-fot">Andel av dem som besvarat frågan.${medRiket ? " Skillnad i procentenheter." : ""}</div></div>`;
      const bakgrund = svg.insert("rect", ":first-child").attr("x", 0).attr("y", cy - radH / 2).attr("width", W).attr("height", radH).attr("rx", 6).attr("fill", "transparent");
      svg.append("rect").attr("x", 0).attr("y", cy - radH / 2).attr("width", W).attr("height", radH).attr("fill", "transparent")
        .on("pointermove pointerdown", () => { bakgrund.attr("fill", "#f3f5f4"); visaTip(html, svg.node(), W, { x0: mL, x1: W - mR, y0: cy - radH / 2, y1: cy + radH / 2 }, "ovanunder"); })
        .on("pointerleave", () => { bakgrund.attr("fill", "transparent"); tooltip.dolj(); });
    });
    legend([...hallandsGrupper.map(g => ({ namn: g.namn, farg: g.farg, form: g.form, bredd: 0 })),
      ...(medRiket ? [{ namn: "Riket (ihålig punkt)", farg: FARG.text, form: "cirkel", hal: true, bredd: 0 }] : [])]);
    const sub = `${mening(kort(rubrik, 120))} Andel i procent av dem som besvarat frågan, flera alternativ kan anges, ${ar}.`;
    ram.setSubtitle(sub);
    const fot = `${KALLA} Frågan redovisas bara för ${ar}.${syntetisk ? " OBS: SYNTETISK TESTDATA." : ""}`;
    ram.setCaption(fot);
    sattTabell(["Svarsalternativ", "Grupp", "År", "Andel, procent"], alt.flatMap(([kod, et]) => grupper.map(gr => { const d = hamta(kod, gr); return [et, gr.namn, ar, d && !d.u ? fmtTal(d.v, 1) : "–"]; })));
    verktyg(svg, W, H, sub, fot);
  }

  function kort(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; }
  function mening(s) { s = String(s || "").trim(); return /[.?!…:]$/.test(s) ? s : s + "."; }

  rita();
  return ram.node();
}
