import fs from "fs";
import path from "path";

const readSourceCss = (relativePath) =>
  fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");

describe("cross-browser viewport scaling", () => {
  const indexCss = readSourceCss("index.css");
  const sidebarCss = readSourceCss("components/Sidebar.css");
  const appCss = readSourceCss("App.css");
  const externalHostCss = readSourceCss("components/ExternalHost.css");
  const appSource = readSourceCss("App.js");

  test("keeps legacy density through CSS zoom without transforming the root", () => {
    expect(indexCss).toMatch(
      /body\s*{[^}]*width:\s*var\(--dataspace-scaled-vw\)[^}]*height:\s*var\(--dataspace-scaled-vh\)[^}]*zoom:\s*var\(--dataspace-ui-scale\)/s
    );
    expect(indexCss).not.toMatch(/#root\s*{[^}]*transform\s*:/s);
  });

  test("disables scaling for Safari", () => {
    expect(indexCss).toMatch(
      /html\.browser-safari\s*{[^}]*--dataspace-ui-scale:\s*1[^}]*--dataspace-scaled-vw:\s*100vw[^}]*--dataspace-scaled-vh:\s*var\(--dataspace-viewport-height\)/s
    );
    expect(indexCss).toMatch(
      /html\.browser-safari\s+body\s*{[^}]*zoom:\s*1/s
    );
  });

  test("uses the dynamic viewport when supported and keeps a vh fallback", () => {
    expect(indexCss).toMatch(/--dataspace-viewport-height:\s*100vh/);
    expect(indexCss).toMatch(
      /@supports\s*\(height:\s*100dvh\)\s*{[\s\S]*--dataspace-viewport-height:\s*100dvh/
    );
    expect(indexCss).toMatch(
      /--dataspace-scaled-vh:\s*calc\(var\(--dataspace-viewport-height\)\s*\/\s*var\(--dataspace-ui-scale\)\)/
    );
  });

  test("keeps every authenticated route inside a footer-safe app viewport", () => {
    expect(sidebarCss).toMatch(
      /\.layout\s*{[^}]*height:\s*var\(--dataspace-scaled-vh,\s*100vh\)[^}]*overflow:\s*hidden/s
    );
    expect(sidebarCss).toMatch(
      /\.layout\s*>\s*\.main\s*{[^}]*display:\s*flex[^}]*height:\s*100%[^}]*overflow:\s*hidden/s
    );
    expect(sidebarCss).toMatch(
      /\.layout\s*>\s*\.main\s*>\s*\.container\s*{[^}]*display:\s*flex[^}]*flex:\s*1\s+1\s+auto[^}]*overflow:\s*hidden/s
    );
    expect(sidebarCss).toMatch(
      /\.layout\s*>\s*\.main\s*>\s*\.container\s*>\s*\.route-content\s*{[^}]*flex:\s*1\s+1\s+auto[^}]*overflow-y:\s*auto[^}]*scrollbar-gutter:\s*auto/s
    );
    expect(appSource).toMatch(
      /<div\s+className="container">\s*<div\s+className="route-content">\s*<Routes>/s
    );
    expect(sidebarCss).toMatch(
      /\.sidebar\s*{[^}]*position:\s*fixed[^}]*height:\s*var\(--dataspace-scaled-vh,\s*100vh\)/s
    );
    expect(indexCss).toMatch(
      /body\.dataspace-shell-active\s+#root\s*{[^}]*overflow:\s*hidden/s
    );
    expect(appCss).toMatch(
      /\.app-footer\s*{[^}]*position:\s*relative[^}]*flex:\s*0\s+0\s+88px/s
    );
  });

  test("does not shorten sidebar highlights with an unused scrollbar gutter", () => {
    expect(sidebarCss).toMatch(
      /\.sb-nav\s*{[^}]*scrollbar-gutter:\s*auto/s
    );
    expect(sidebarCss).not.toMatch(
      /\.sb-nav\s*{[^}]*scrollbar-gutter:\s*stable/s
    );
  });

  test("contains questionnaire results inside its framed embedded stage", () => {
    expect(sidebarCss).toMatch(
      /\.layout--health-questionnaire\s*>\s*\.main\s*>\s*\.container\s*{[^}]*overflow:\s*hidden/s
    );
    expect(appCss).toMatch(
      /\.solid-health-questionnaire-embed\s*{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s
    );
    expect(appCss).toMatch(
      /\.health-questionnaire-frame\s*{[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s
    );
  });

  test("lets catalog wheel input reach its vertical scroll owner", () => {
    expect(appCss).toMatch(
      /\.data-catalog-embed\s+\.catalog-table\s*{[^}]*overflow-y:\s*auto/s
    );
    expect(appCss).toMatch(
      /\.data-catalog-embed\s+\.dataset-grid\s*{[^}]*overscroll-behavior-y:\s*auto/s
    );
  });

  test("keeps the data manager frame fixed while its file table scrolls", () => {
    expect(sidebarCss).toMatch(
      /\.layout--data-manager\s*>\s*\.main\s*>\s*\.container,[^{]*{[^}]*overflow:\s*hidden/s
    );
    expect(appCss).toMatch(
      /\.data-manager-embed\s*{[^}]*display:\s*flex[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*flex-direction:\s*column/s
    );
    expect(appCss).toMatch(
      /\.data-manager-embed\s*>\s*\.toolbar--title\s*{[^}]*flex:\s*0\s+0\s+auto/s
    );
    expect(appCss).toMatch(
      /\.data-manager-embed\s+\.data-manager-layout\s*{[^}]*display:\s*flex[^}]*height:\s*auto[^}]*min-height:\s*0[^}]*flex:\s*1\s+1\s+auto[^}]*overflow:\s*hidden/s
    );
    expect(appCss).toMatch(
      /\.data-manager-embed\s+\.data-manager-main\s*{[^}]*height:\s*auto[^}]*min-height:\s*0[^}]*flex:\s*1\s+1\s+auto[^}]*overflow:\s*hidden/s
    );
  });

  test("keeps the Profile Manager free of an outer dashed frame", () => {
    expect(appCss).toMatch(/\.profile-panel\s*{[^}]*border:\s*0/s);
    expect(appCss).not.toMatch(
      /\.profile-panel\s*{[^}]*border\s*:[^;}]*dashed/s
    );
  });

  test("retains scaled sizing for the clipped tour route", () => {
    expect(indexCss).toMatch(
      /body\.solid-tours-route,[^{]*{[^}]*height:\s*var\(--dataspace-scaled-vh\)[^}]*overflow:\s*hidden/s
    );
    expect(indexCss).toMatch(
      /body\.solid-tours-route\s*#root,[^{]*{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s
    );
  });

  test("sizes external applications from the footer-safe content frame", () => {
    expect(externalHostCss).toMatch(
      /\.external-host-container\s*{[^}]*display:\s*flex[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s
    );
    expect(externalHostCss).toMatch(
      /\.external-host-shell--framed\s*{[^}]*min-height:\s*0[^}]*flex:\s*1\s+1\s+auto/s
    );
    expect(externalHostCss).toMatch(
      /\.external-host-frame\s*{[^}]*height:\s*100%[^}]*min-height:\s*0/s
    );
    expect(externalHostCss).not.toMatch(
      /\.external-host-(?:shell--framed|frame)\s*{[^}]*var\(--dataspace-scaled-vh/s
    );
  });
});
