export const INFO_ARCHITECTURE_NODES = [
  {
    id: "identity",
    iconKey: "identity",
    label: "WebID",
    detail: "One identity across the Dataspace",
  },
  {
    id: "storage",
    iconKey: "storage",
    label: "Personal Pod",
    detail: "Your primary storage location",
  },
  {
    id: "control",
    iconKey: "control",
    label: "Access control",
    detail: "Explicit permissions with WAC",
  },
  {
    id: "use",
    iconKey: "use",
    label: "Catalog & applications",
    detail: "Discover and use approved data",
  },
];

export const INFO_TOOL_GROUPS = [
  {
    id: "manage",
    iconKey: "manage",
    title: "Manage your personal workspace",
    description:
      "Organize Pod data, maintain your identity and keep access activity understandable.",
    tools: [
      {
        id: "data-manager",
        title: "Solid Data Manager",
        description: "Manage files, folders and resource permissions in your Pod.",
        to: "/",
        iconKey: "data-manager",
      },
      {
        id: "profile",
        title: "Profile Manager",
        description: "Maintain your WebID, inbox, catalog, registries and language.",
        to: "/profile",
        iconKey: "profile",
      },
      {
        id: "transactions",
        title: "Transaction History",
        description: "Review access activity and active Dataspace connections.",
        to: "/transactions",
        iconKey: "transactions",
      },
      {
        id: "pod-provider",
        title: "Solid Pod Provider",
        description: "Manage the Solid account and Pod provider configuration.",
        to: "/pod-provider",
        iconKey: "pod-provider",
      },
    ],
  },
  {
    id: "exchange",
    iconKey: "exchange",
    title: "Connect, describe and govern data",
    description:
      "Turn Pod resources into discoverable, reusable and permissioned data flows.",
    tools: [
      {
        id: "catalog",
        title: "Semantic Data Catalog",
        description: "Publish and discover datasets, series and their metadata.",
        to: "/catalog",
        iconKey: "catalog",
      },
      {
        id: "plasma",
        title: "PLASMA",
        description: "Create semantic models that make datasets easier to reuse.",
        to: "/web/plasma",
        iconKey: "plasma",
      },
      {
        id: "node-red",
        title: "Node-RED",
        description: "Build visual flows for live data and automation.",
        to: "/web/node-red",
        iconKey: "node-red",
      },
      {
        id: "data-connection",
        title: "Data Connection",
        description:
          "Synchronize selected Home Assistant entities or custom APIs into your Pod.",
        to: "/data-connection",
        iconKey: "data-connection",
      },
      {
        id: "requests",
        title: "Access Requests",
        description: "Approve, deny, expire or revoke requests for protected resources.",
        to: "/notifications",
        iconKey: "requests",
      },
      {
        id: "decisions",
        title: "Access Decisions",
        description: "Track responses to access requests that you have sent.",
        to: "/decisions",
        iconKey: "decisions",
      },
    ],
  },
];

export const INFO_APPLICATION_DETAILS = {
  "environmental-monitoring": {
    eyebrow: "Environment & movement",
    description:
      "Explore weather, soil and movement data on a map. Approved tour activity can appear from the first contribution; direct identifiers are removed, but an individual route may still identify a person or place.",
    dataNote: "Catalog data and route summaries without direct identifiers",
  },
  "solid-health-app": {
    eyebrow: "Personal health data",
    description:
      "Synchronize selected Google Fit metrics such as steps, calories, sleep, heart rate and weight into your personal Pod.",
    dataNote: "Selected metrics stored in your Pod",
  },
  "solid-tours": {
    eyebrow: "Routes & activities",
    description:
      "Draw or import routes, record walking and cycling activities, exchange catalog routes and explicitly donate completed-tour data.",
    dataNote: "Private drafts with explicit publication and donation",
  },
  "solid-health-questionnaire": {
    eyebrow: "Private self-check",
    description:
      "Answer 18 questions across five health areas and keep the completed assessment privately in your Pod. It is not a medical diagnosis.",
    dataNote: "Owner-only assessment results in your Pod",
  },
  "solid-chatbot": {
    eyebrow: "Source-grounded assistant",
    description:
      "Select compatible files from your own or connected Pods and use them as sources for a user-isolated RAG workspace.",
    dataNote: "Source selection in the Pod; per-user vector index",
  },
};

export const INFO_FLOW_STEPS = [
  {
    title: "Identify and onboard",
    description:
      "Sign in with Solid-OIDC. Your WebID connects the session to your Pod, inbox, catalog and registries.",
  },
  {
    title: "Store or connect",
    description:
      "Upload resources directly or connect selected external sources such as Home Assistant and custom APIs.",
  },
  {
    title: "Describe and publish",
    description:
      "Add metadata or semantic models, then explicitly index the resources that should become discoverable.",
  },
  {
    title: "Request and decide",
    description:
      "Protected data stays protected until its owner approves a purpose-bound access request.",
  },
  {
    title: "Use and trace",
    description:
      "Applications use approved data while requests, decisions and active connections remain visible in the Manager.",
  },
];

export const INFO_DATA_BOUNDARIES = [
  {
    iconKey: "pod",
    title: "Personal Pod",
    label: "Primary storage",
    description:
      "Profiles, application state, questionnaire results, routes and connection settings are stored in the user's Solid Pod according to each app's access policy.",
  },
  {
    iconKey: "catalog",
    title: "Catalog & registry",
    label: "Explicitly discoverable",
    description:
      "Only metadata and distributions that a user explicitly indexes are made discoverable. Protected source resources still require permission.",
  },
  {
    iconKey: "browser",
    title: "Browser & source providers",
    label: "Integration state",
    description:
      "Some integrations keep tokens or interface selections in browser storage and contact configured sources such as Google Fit, Home Assistant, custom APIs or Open-Meteo.",
  },
  {
    iconKey: "services",
    title: "Purpose-bound services",
    label: "Transparent processing",
    description:
      "The sync worker keeps operational state, PLASMA and Node-RED use service storage, movement donations are aggregated, and chatbot embeddings are kept in per-WebID Qdrant indexes.",
  },
];

export const INFO_CURRENT_SCOPE = [
  "Embedded applications reuse the Manager's authenticated Solid session. Several applications also provide a standalone build with their own sign-in.",
  "Solid Tours draws and imports routes, but it does not record live GPS tracks or call a routing service.",
  "The Health Questionnaire is an orientation tool. Its score thresholds are product assumptions, not clinically validated cutoffs.",
  "Chatbot processing uses Ollama, Qdrant and a configured Qwen/vLLM endpoint. Server-side indexing currently works reliably for anonymously readable sources.",
];

export const INFO_GLOSSARY = [
  {
    term: "Pod",
    definition:
      "A personal web data store made of addressable resources and containers. The owner controls access.",
  },
  {
    term: "WebID",
    definition:
      "A dereferenceable web address that identifies a person or service across Solid applications.",
  },
  {
    term: "Solid-OIDC",
    definition:
      "The sign-in protocol that authenticates a Solid session and links it to a WebID.",
  },
  {
    term: "WAC",
    definition:
      "Web Access Control rules define which agents may read, append, write or control a Pod resource.",
  },
  {
    term: "Inbox",
    definition:
      "The Pod location used to receive access requests, decisions and other linked-data notifications.",
  },
  {
    term: "Catalog & registry",
    definition:
      "The catalog describes published datasets; registries make participating Pods and catalogs discoverable.",
  },
];
