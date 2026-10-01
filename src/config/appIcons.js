import {
  faBell, faBookOpen, faChartLine, faClipboardCheck, faDatabase,
  faDiagramProject, faFolder, faHeartPulse, faHexagonNodes, faInbox,
  faInfo, faLink, faMagnifyingGlass, faRoute, faServer, faTableColumns, faTemperatureHigh, faUser,
} from "@fortawesome/free-solid-svg-icons";
import { getAppsBySection } from "./runtimeConfig";

// Sidebar and loading screens share the same icon definitions (not title text).
// Explicit imports: https://docs.fontawesome.com/web/use-with/react/add-icons#add-individual-icons
export const navigationIcons = {
  "solid-data-manager": faFolder,
  transactions: faChartLine,
  notifications: faInbox,
  decisions: faBell,
  profile: faUser,
  info: faInfo,
  catalog: faBookOpen,
  "semantic-search": faMagnifyingGlass,
  plasma: faHexagonNodes,
  "node-red": faDiagramProject,
  "data-connection": faLink,
  statistics: faChartLine,
  "pod-provider": faServer,
};

const appIcons = {
  default: faTableColumns,
  temperature: faTemperatureHigh,
  database: faDatabase,
  health: faHeartPulse,
  questionnaire: faClipboardCheck,
  tour: faRoute,
  server: faServer,
};

const defaultAppIconKeys = {
  "environmental-monitoring": "temperature",
  "solid-health-app": "health",
  "solid-health-questionnaire": "questionnaire",
  "city-tours": "tour",
};

export function getAppIcon(iconKey) {
  return Object.prototype.hasOwnProperty.call(appIcons, iconKey)
    ? appIcons[iconKey]
    : appIcons.default;
}

export function getApplicationIcon(appId) {
  if (Object.prototype.hasOwnProperty.call(navigationIcons, appId)) {
    return navigationIcons[appId];
  }
  const app = getAppsBySection("applications").find(
    (candidate) => candidate.id === appId || candidate.href === `/web/${appId}`
  );
  return getAppIcon(app ? app.iconKey : defaultAppIconKeys[appId]);
}
