window.__APP_CONFIG__ = {
  "apps": [
    {
      "id": "environmental-monitoring",
      "title": "Environmental Monitoring",
      "href": "/web/environmental-monitoring",
      "section": "applications",
      "iconKey": "temperature",
      "visible": true,
      "order": 15,
      "linkType": "internal"
    },
    {
      "id": "solid-health-app",
      "title": "Solid Health App",
      "href": "/web/solid-health-app",
      "section": "applications",
      "iconKey": "health",
      "visible": true,
      "order": 20,
      "linkType": "internal"
    },
    {
      "id": "solid-chatbot",
      "title": "Solid Chatbot",
      "href": "/web/solid-chatbot",
      "section": "applications",
      "iconKey": "rocketchat",
      "visible": true,
      "order": 25,
      "linkType": "internal"
    }
  ],
  "providers": [
    {
      "id": "tmdt-solid",
      "label": "TMDT Solid Server",
      "issuer": "https://solid-community-server.tmdt.info",
      "note": "Recommended",
      "enabled": true,
      "recommended": true
    },
    {
      "id": "solid-community",
      "label": "Solid Community Server",
      "issuer": "https://solidcommunity.net",
      "note": "Public community server",
      "enabled": true,
      "recommended": false
    }
  ],
  "branding": {
    "projectName": "TMDT",
    "logoUrl": "/project-logos/Logo_TMDT.png",
    "logoAlt": "TMDT Logo",
    "logoWidth": "95px",
    "logoHeight": "auto"
  },
  "fundingLogos": [],
  "fundingGrantNumber": "",
  "syncWorker": {
    "enabled": true,
    "apiUrl": "/sync-worker",
    "serviceWebId": "https://solid-community-server.tmdt.info/solidserviceworker/profile/card#me",
    "intervalMinutes": 10
  },
  "statistics": {
    "enabled": true,
    "adminWebIds": [
      "https://solid-community-server.tmdt.info/solidtestpod/profile/card#me"
    ],
    "workerWebId": "https://solid-community-server.tmdt.info/solidserviceworker/profile/card#me",
    "podBaseUrl": "https://solid-community-server.tmdt.info/solidtestpod/statistics-local/",
    "eventsUrl": "",
    "timezone": "Europe/Berlin",
    "activityResourcePath": "private/solid-dataspace/statistics/activity.ttl"
  }
};
