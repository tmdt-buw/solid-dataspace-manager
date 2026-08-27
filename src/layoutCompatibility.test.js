import fs from "fs";
import path from "path";

const readSourceCss = (relativePath) =>
  fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");

describe("cross-browser viewport scaling", () => {
  const indexCss = readSourceCss("index.css");
  const sidebarCss = readSourceCss("components/Sidebar.css");
  const appCss = readSourceCss("App.css");
  const externalHostCss = readSourceCss("components/ExternalHost.css");

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

  test("keeps scrolling inside main so fixed shell elements stay viewport aligned", () => {
    expect(sidebarCss).toMatch(
      /\.layout\s*{[^}]*height:\s*var\(--dataspace-scaled-vh,\s*100vh\)[^}]*overflow:\s*hidden/s
    );
    expect(sidebarCss).toMatch(
      /\.layout\s*>\s*\.main\s*{[^}]*height:\s*100%[^}]*overflow-y:\s*auto/s
    );
    expect(sidebarCss).toMatch(
      /\.sidebar\s*{[^}]*position:\s*fixed[^}]*height:\s*var\(--dataspace-scaled-vh,\s*100vh\)/s
    );
    expect(appCss).toMatch(/\.app-footer\s*{[^}]*position:\s*fixed/s);
  });

  test("retains scaled sizing for the clipped tour route and external embeds", () => {
    expect(indexCss).toMatch(
      /body\.solid-tours-route\s*{[^}]*height:\s*var\(--dataspace-scaled-vh\)[^}]*overflow:\s*hidden/s
    );
    expect(indexCss).toMatch(
      /body\.solid-tours-route\s*#root\s*{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s
    );
    expect(externalHostCss).toMatch(
      /\.external-host-frame\s*{[^}]*height:\s*calc\(var\(--dataspace-scaled-vh,\s*100vh\)\s*-\s*250px\)/s
    );
  });
});
