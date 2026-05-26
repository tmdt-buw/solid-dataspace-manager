const formatHomeAssistantError = async (response) => {
  let detail = "";
  try {
    const payload = await response.json();
    detail = payload?.message || payload?.error || "";
  } catch {
    try {
      detail = await response.text();
    } catch {
      detail = "";
    }
  }

  if (response.status === 401 || response.status === 403) {
    return "Home Assistant rejected the access token.";
  }

  return detail
    ? `Home Assistant request failed (${response.status}): ${detail}`
    : `Home Assistant request failed (${response.status}).`;
};

const getCurrentOrigin = () =>
  typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "this Solid Dataspace Manager origin";

const probeEndpointReachability = async (endpoint, signal) => {
  try {
    await fetch(`${endpoint}/api/`, {
      method: "GET",
      mode: "no-cors",
      signal,
      cache: "no-store",
    });
    return true;
  } catch {
    return false;
  }
};

const hasProtocol = (value) => /^[a-z][a-z0-9+.-]*:\/\//i.test(value);

const looksLikeRawIpv6Address = (value) => {
  const trimmed = String(value || "").trim();
  return (
    trimmed.includes(":") &&
    trimmed.indexOf(":") !== trimmed.lastIndexOf(":") &&
    !trimmed.startsWith("[") &&
    !trimmed.includes("/") &&
    !hasProtocol(trimmed)
  );
};

const prepareEndpointSource = (value, defaultProtocol = "http") => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (hasProtocol(trimmed)) return trimmed;
  if (looksLikeRawIpv6Address(trimmed)) {
    return `${defaultProtocol}://[${trimmed}]`;
  }
  return `${defaultProtocol}://${trimmed}`;
};

export const getHomeAssistantEndpoint = ({ endpoint, url, port } = {}) => {
  const source = endpoint || url || "";
  if (!source) return "";

  const trimmedPort = String(port || "").trim();
  const inferredProtocol =
    !hasProtocol(source) && trimmedPort === "443" ? "https" : "http";
  const withProtocol = prepareEndpointSource(source, inferredProtocol);
  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error("Enter a valid Home Assistant URL.");
  }

  if (trimmedPort) {
    const numericPort = Number(trimmedPort);
    if (
      !Number.isInteger(numericPort) ||
      numericPort < 1 ||
      numericPort > 65535
    ) {
      throw new Error("Enter a valid port between 1 and 65535.");
    }
    parsed.port = trimmedPort;
  }

  const pathname = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
  return `${parsed.origin}${pathname}`.replace(/\/+$/, "");
};

export const getHomeAssistantEndpointCandidates = (connection = {}) => {
  const candidates = [getHomeAssistantEndpoint(connection)];

  return Array.from(new Set(candidates.filter(Boolean)));
};

const fetchHomeAssistantJsonWithEndpoint = async (
  connection,
  path,
  { signal } = {}
) => {
  const endpoints = getHomeAssistantEndpointCandidates(connection);
  const accessToken = String(connection?.accessToken || "").trim();

  if (!endpoints.length) {
    throw new Error("Home Assistant endpoint is required.");
  }

  if (!accessToken) {
    throw new Error("Home Assistant access token is required.");
  }

  let lastError = null;
  for (const endpoint of endpoints) {
    let response;
    try {
      response = await fetch(`${endpoint}${path}`, {
        method: "GET",
        signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      const reachableWithoutCors = await probeEndpointReachability(
        endpoint,
        signal
      );
      lastError = reachableWithoutCors
        ? new Error(
            `Browser can reach ${endpoint}, but the authenticated API request is blocked. Add ${getCurrentOrigin()} to Home Assistant cors_allowed_origins.`
          )
        : new Error(`Could not reach ${endpoint}.`);
      continue;
    }

    if (!response.ok) {
      const message = await formatHomeAssistantError(response);
      if (response.status === 401 || response.status === 403) {
        throw new Error(message);
      }
      lastError = new Error(`${endpoint}: ${message}`);
      continue;
    }

    return { data: await response.json(), endpoint };
  }

  const tried = endpoints.join(", ");
  throw new Error(
    `Home Assistant could not be reached via ${tried}. Check the URL/IP address, port, network access, HTTPS/mixed-content rules, and CORS settings.${
      lastError ? ` Last error: ${lastError.message}` : ""
    }`
  );
};

const fetchHomeAssistantStatesWithEndpoint = async (connection, options = {}) => {
  const { data, endpoint } = await fetchHomeAssistantJsonWithEndpoint(
    connection,
    "/api/states",
    options
  );
  if (!Array.isArray(data)) {
    throw new Error(`${endpoint}: unexpected response.`);
  }
  return { states: data, endpoint };
};

export async function fetchHomeAssistantStates(connection, options = {}) {
  const { states } = await fetchHomeAssistantStatesWithEndpoint(connection, options);
  return states;
}

const normalizeEntity = (state) => {
  const entityId = state?.entity_id || "";
  const attributes = state?.attributes || {};
  const domain = entityId.includes(".") ? entityId.split(".")[0] : "unknown";

  return {
    entityId,
    domain,
    state: state?.state ?? "",
    friendlyName: attributes.friendly_name || entityId,
    unit: attributes.unit_of_measurement || "",
    deviceClass: attributes.device_class || "",
    lastChanged: state?.last_changed || "",
    lastUpdated: state?.last_updated || "",
    attributes,
  };
};

export async function loadHomeAssistantEntities(connection, options = {}) {
  const states = await fetchHomeAssistantStates(connection, options);
  return states
    .map(normalizeEntity)
    .filter((entity) => entity.entityId)
    .sort((a, b) => {
      const domainCompare = a.domain.localeCompare(b.domain);
      if (domainCompare !== 0) return domainCompare;
      return a.friendlyName.localeCompare(b.friendlyName);
    });
}

export async function testHomeAssistantConnection(connection, options = {}) {
  const { endpoint } = await fetchHomeAssistantJsonWithEndpoint(
    connection,
    "/api/config",
    options
  );

  return {
    ok: true,
    endpoint,
  };
}
