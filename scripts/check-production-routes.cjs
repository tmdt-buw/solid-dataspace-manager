// Run against the built Manager served with serve.json, not the CRA dev server.
const assert = require("node:assert/strict");
const base = process.argv[2];
if (!base) {
  console.error("Usage: npm run check:production-routes -- http://127.0.0.1:3301");
  process.exit(1);
}
const origin = new URL(base);
let checks = 0;
async function request(path, redirect = "manual") {
  const response = await fetch(new URL(path, origin), {
    redirect,
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200, `${path}: expected 200, got ${response.status}`);
  checks += 1;
  return response;
}
async function main() {
  for (const language of ["de", "en"]) {
    for (const page of ["imprint", "privacy"]) {
      const canonical = `/legal/${language}/${page}.html`;
      const response = await request(canonical);
      assert.match(response.headers.get("content-type"), /text\/html/);
      const html = await response.text();
      assert.ok(html.includes(`<html lang="${language}">`), canonical);
      assert.ok(html.includes('class="document"'), `${canonical}: missing legal document`);
      assert.ok(!html.includes('id="root"'), `${canonical}: received the application instead`);
      // The old server cached a permanent redirect from .html to this alias.
      // Serve it directly so that old browser caches cannot cause a redirect loop.
      for (const suffix of ["", "?lang=" + language]) {
        assert.equal(await (await request(`/legal/${language}/${page}${suffix}`)).text(), html);
      }
      const slash = await request(`/legal/${language}/${page}/`, "follow");
      assert.equal(new URL(slash.url).pathname, `/legal/${language}/${page}`);
      assert.equal(await slash.text(), html);
    }
  }
  const css = await request("/legal/legal.css");
  assert.match(css.headers.get("content-type"), /text\/css/);
  assert.ok((await css.text()).includes(".legal-layout"));
  for (const asset of ["tmdt-logo.png", "Manrope.ttf"]) {
    const response = await request(`/legal/assets/${asset}`);
    assert.ok(!response.headers.get("content-type").includes("text/html"), asset);
    assert.ok((await response.arrayBuffer()).byteLength > 1000, asset);
  }
  const app = await (await request("/")).text();
  assert.ok(app.includes('id="root"'));
  for (const route of ["/catalog", "/profile", "/web/city-tours", "/web/solid-health-app/detail/steps"]) {
    assert.equal(await (await request(route)).text(), app, `${route}: SPA fallback failed`);
  }
  console.log(`Passed ${checks} production HTTP checks: bilingual legal pages, cached aliases, assets and app routes.`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
