// One bilingual source for every instance and the Community Solid Server.
const fs = require("node:fs");
const path = require("node:path");
const content = require("../legal/content.json");
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
function link(item) {
  if (!/^(https:\/\/|mailto:)/.test(item.url)) throw new Error(`Unsupported legal link: ${item.url}`);
  return `<a href="${escape(item.url)}">${escape(item.label)}</a>`;
}
function render(language, page) {
  const copy = content[language];
  const sections = copy[`${page}Sections`];
  const draft = page === "privacy" && content.privacyStatus === "draft";
  const navigation = ["imprint", "privacy"].map((name) => `<a href="${name}.html"${name === page ? ' aria-current="page"' : ""}>${escape(copy[name])}</a>`).join("");
  const contents = `<ol>${sections.map((section, i) => `<li><a href="#section-${i + 1}">${escape(section.title.replace(/^\d+\.\s*/, ""))}</a></li>`).join("")}</ol>`;
  const legalLabel = language === "de" ? "Rechtliche Informationen" : "Legal information";
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${draft ? '<meta name="robots" content="noindex">' : ''}
<meta name="referrer" content="no-referrer">
<title>${escape(copy[page])} - Solid Dataspace</title>
<link rel="icon" href="../assets/tmdt-logo.png">
<link rel="stylesheet" href="../legal.css">
</head>
<body>
<a class="skip-link" href="#main">${language === "de" ? "Zum Inhalt" : "Skip to content"}</a>
<header class="site-header">
  <a class="brand" href="/?lang=${language}"><img src="../assets/tmdt-logo.png" alt="" width="52" height="52"><span>${escape(copy.brand)}</span></a>
  <nav class="languages" aria-label="${escape(copy.language)}">
    ${["de", "en"].map((lang) => `<a href="../${lang}/${page}.html" lang="${lang}" hreflang="${lang}"${lang === language ? ' aria-current="true"' : ''}>${lang === "de" ? "Deutsch" : "English"}</a>`).join("")}
  </nav>
</header>
<div class="legal-layout">
<aside class="legal-sidebar" aria-label="${legalLabel}">
  <nav class="page-links" aria-label="${legalLabel}"><p class="nav-heading">${legalLabel}</p>${navigation}</nav>
  <nav class="contents contents--desktop" aria-label="${escape(copy.contents)}"><p class="nav-heading">${escape(copy.contents)}</p>${contents}</nav>
  <details class="contents contents--mobile"><summary>${escape(copy.contents)}</summary><nav aria-label="${escape(copy.contents)}">${contents}</nav></details>
</aside>
<main class="document" id="main" tabindex="-1">
  <header class="document-header">
    <p class="revision">${escape(copy.updated)}: <time datetime="${content.revision}">${content.revision}</time></p>
    <h1>${escape(copy[page])}</h1>
    <p class="summary">${escape(copy.summary)}</p>
  </header>
  ${draft ? `<aside class="draft" aria-labelledby="draft-title"><h2 id="draft-title">${escape(copy.draftTitle)}</h2><p>${escape(copy.draftBody)}</p></aside>` : ''}
  ${sections.map((section, i) => `<section aria-labelledby="section-${i + 1}"><h2 id="section-${i + 1}">${escape(section.title)}</h2>${section.paragraphs.map((paragraph) => `<p>${escape(paragraph)}</p>`).join("")}${section.links?.length ? `<ul class="source-links">${section.links.map((item) => `<li>${link(item)}</li>`).join("")}</ul>` : ''}</section>`).join("\n")}
</main>
</div>
<footer><a href="/?lang=${language}">${escape(copy.home)}</a><span>© TMDT, Bergische Universität Wuppertal</span></footer>
</body>
</html>\n`;
}
// Optional output folder also permits serving exactly these pages on the CSS host.
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--output")) {
  throw new Error("Usage: node scripts/build-legal-pages.cjs [--output DIRECTORY]");
}
const output = args.length ? path.resolve(args[1]) : path.resolve(__dirname, "../public/legal");
for (const language of ["de", "en"]) {
  fs.mkdirSync(path.join(output, language), { recursive: true });
  for (const page of ["imprint", "privacy"]) {
    fs.writeFileSync(path.join(output, language, `${page}.html`), render(language, page), "utf8");
  }
}
const cssSource = path.resolve(__dirname, "../public/legal/legal.css");
if (path.join(output, "legal.css") !== cssSource) fs.copyFileSync(cssSource, path.join(output, "legal.css"));
const assetSource = path.resolve(__dirname, "../public/legal/assets");
const assetOutput = path.join(output, "assets");
if (assetOutput !== assetSource) {
  fs.mkdirSync(assetOutput, { recursive: true });
  for (const name of ["Manrope.ttf", "OFL.txt", "tmdt-logo.png"]) {
    fs.copyFileSync(path.join(assetSource, name), path.join(assetOutput, name));
  }
}
console.log(`Generated shared legal pages (${content.revision}, privacy: ${content.privacyStatus}).`);
