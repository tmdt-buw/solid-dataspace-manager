// Carry the Dataspace language through OIDC and establish the selected account
// in a top-level request. Never put account credentials in the redirect URL.
import { usesProviderLogin } from "./loginMode";

const HANDOFF_ISSUER = "https://solid-community-server.tmdt.info";

export function accountLoginRedirect(issuer, accountToken, language = "en") {
  if (new URL(issuer).origin !== HANDOFF_ISSUER) return undefined;
  return (authorizationUrl) => {
    const target = new URL(authorizationUrl);
    if (target.origin !== HANDOFF_ISSUER || target.pathname !== "/.oidc/auth") {
      throw new Error("Unexpected Solid authorization endpoint.");
    }
    target.searchParams.set("ui_locales", language === "de" ? "de" : "en");
    if (!accountToken || usesProviderLogin()) {
      window.location.assign(target.href);
      return;
    }
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${HANDOFF_ISSUER}/.account/dataspace-login/`;
    form.hidden = true;
    for (const [name, value] of Object.entries({ authorization: accountToken, authorizationUrl: target.href })) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    form.remove();
  };
}
