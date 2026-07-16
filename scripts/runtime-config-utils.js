function parseBooleanValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

module.exports = { parseBooleanValue };
