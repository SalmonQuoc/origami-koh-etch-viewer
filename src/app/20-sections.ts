// =====================================================================================================
// collapsible panel sections: a click (or Enter / Space) on a section heading opens or closes the
// content up to the next heading. On load every section is closed except the first one of each panel;
// the 3D view is never folded. A source list at the very end of a panel (details.srcs) stays outside.
function foldSet(h: Element, open: boolean, redraw = true) {
  h.classList.toggle("closed", !open); h.setAttribute("aria-expanded", String(open));
  const body = h.nextElementSibling;
  // canvases inside a closed section have no size; draw them again once they are visible
  if (open && redraw && body && body.querySelector("canvas")) requestAnimationFrame(redrawAll);
}
function openFoldsAround(el: Element | null) {   // open every closed section that contains el
  for (let e = el; e; e = e.parentElement) {
    if (!e.classList || !e.classList.contains("foldBody")) continue;
    const h = e.previousElementSibling; if (h && h.classList.contains("closed")) foldSet(h, true);
  }
}
function foldAllIn(box: Element, open: boolean) { for (const h of box.querySelectorAll(".foldH")) foldSet(h, open, false); if (open) requestAnimationFrame(redrawAll); }
(function () {
  function makeFolds(box: Element | null, tag: "H2" | "H3", openFirst: boolean) {
    if (!box) return;
    const kids = Array.from(box.children); let first = true;
    for (let i = 0; i < kids.length; i++) {
      const h = kids[i]; if (h.tagName !== tag) continue;
      const body = document.createElement("div"); body.className = "foldBody";
      let j = i + 1;
      for (; j < kids.length; j++) {
        const k = kids[j];
        if (k.tagName === tag || (j === kids.length - 1 && k.matches("details.srcs"))) break;
        body.append(k);
      }
      h.after(body); i = j - 1;
      h.classList.add("foldH"); h.setAttribute("role", "button"); h.setAttribute("tabindex", "0");
      h.setAttribute("title", "Click to open or close this section");
      foldSet(h, openFirst && first, false); first = false;
    }
  }
  for (const id of ["panelModel", "panelPit", "cornerBox", "simExBox", "panelFind"]) makeFolds($(id), "H3", true);
  makeFolds($("panelSim"), "H3", false);   // its first sections sit in cornerBox and simExBox
  for (const id of ["simBelow", "findBelow", "pitBelow"]) makeFolds($(id), "H2", true);
  for (const id of ["panelModel", "panelPit", "panelSim", "panelFind"]) {
    const a = $(id); if (!a) continue;
    const bar = document.createElement("div"); bar.className = "foldAll note";
    bar.innerHTML = 'Sections: <button type="button" class="linkbtn" data-fold="1">open all</button> · <button type="button" class="linkbtn" data-fold="0">close all</button>';
    bar.addEventListener("click", e => { const b = (e.target as Element).closest("[data-fold]"); if (b) foldAllIn(a, b.getAttribute("data-fold") === "1"); });
    a.prepend(bar);
  }
  document.addEventListener("click", e => {
    const h = (e.target as Element).closest && (e.target as Element).closest(".foldH");
    if (h) foldSet(h, h.classList.contains("closed"));
  });
  document.addEventListener("keydown", e => {
    const h = e.target as Element;
    if (!h.classList || !h.classList.contains("foldH") || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault(); foldSet(h, h.classList.contains("closed"));
  });
})();
