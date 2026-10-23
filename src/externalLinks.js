import { getPlasmaUrl } from "./config/runtimeConfig";

export const externalLinks = [
  {
    slug: "plasma",
    title: "PLASMA",
    url: getPlasmaUrl(),
    hideOpenButton: true,
  },
  {
    slug: "node-red",
    title: "Node-RED",
    url: "/node-red/",
    hideOpenButton: true,
  },
  {
    slug: "environmental-monitoring",
    title: "Environmental Monitoring",
    url: "/environmental-monitoring/",
    version: "0.3.21",
    hideOpenButton: true,
  },
  {
    slug: "solid-health-app",
    title: "Health App",
    url: "/solid-health-app/",
    version: "0.1.26",
    hideOpenButton: true,
  },
];
