# Preserve the installed CSS 7.2.0 security and login-language fixes.
FROM local/solid-css:cve-2026-111497-20261102t191037z
COPY apply.cjs atomic-document.cjs /opt/upload-integrity/
RUN node /opt/upload-integrity/apply.cjs
LABEL info.tmdt.upload-integrity="atomic-document-v1"
