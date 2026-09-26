# Interface language and data boundaries

German and English UI copy must preserve the meaning of the action. Translate maintained navigation labels, instructions, validation messages and descriptions. Prefer natural German wording and the existing informal address (du).

Keep technical names recognizable: **Pod Root**, **Inbox**, WebID, Solid-OIDC, WAC, ACP, RDF, SPARQL, IRIs, API names and file formats. Explain permission names when helpful: Read (lesen), Append (Daten anhängen), Write (schreiben), Control (Zugriffsrechte verwalten).

Resource data is never UI copy. Keep file and folder names, path segments, URLs, identifiers, RDF literals, catalog titles and descriptions, person and organization names, sensor names, and user messages exactly as supplied. Preserve case. A folder named settings or Settings stays unchanged; the Settings menu can be translated as Einstellungen. Do not rename or migrate Pod resources for a language change.

Use the standard HTML attribute **translate="no"** around raw data, including titles and other descriptive attributes containing that data. All DOM translators in the application suite respect this boundary, including when an app is embedded in the Manager. Code, preformatted content, textareas and editable content are also excluded. Keep surrounding labels and controls outside that boundary. Components with explicit bilingual rendering can protect their complete root from the host's fallback translator while continuing to render their own localized labels.

Regression checks must switch German → English → German and verify both translated actions and unchanged data. Check file navigation and search result links against the original URL, not a displayed translation.

Reference: [HTML translate attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/translate).
