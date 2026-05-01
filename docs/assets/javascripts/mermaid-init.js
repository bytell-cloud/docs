// Initialize Mermaid against the page theme.
// mkdocs-material toggles `data-md-color-scheme` on <body>; mirror it.
(function () {
  function detectTheme() {
    const scheme =
      document.body.getAttribute("data-md-color-scheme") ||
      (window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "slate"
        : "default");
    return scheme === "slate" ? "dark" : "default";
  }

  function init() {
    if (!window.mermaid) return;
    window.mermaid.initialize({
      startOnLoad: true,
      theme: detectTheme(),
      securityLevel: "strict",
      flowchart: { useMaxWidth: true, htmlLabels: true },
    });
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
