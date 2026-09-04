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
    version: "0.3.8",
    hideOpenButton: true,
  },
  {
    slug: "solid-health-app",
    title: "Solid Health App",
    url: "/solid-health-app/",
    version: "0.1.22",
    hideOpenButton: true,
  },
  {
    slug: "solid-chatbot",
    title: "Solid Chatbot",
    url: "/solid-chatbot/",
    version: "0.1.12",
    hideOpenButton: true,
  },
];
