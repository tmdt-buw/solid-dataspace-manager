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
    slug: "urban-data-explorer",
    title: "Urban Data Explorer",
    url: "/urban-data-explorer/",
    version: "0.3.24",
    hideOpenButton: true,
  },
  {
    slug: "solid-health-app",
    title: "Health App",
    url: "/solid-health-app/",
    version: "0.1.31",
    hideOpenButton: true,
  },
];
