window.__APP_CONFIG__ = {
  "dataspaceId": "stadt-wuppertal",
  "plasmaUrl": "/plasma/modelings",
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
      "title": "Health App",
      "href": "/web/solid-health-app",
      "section": "applications",
      "iconKey": "health",
      "visible": true,
      "order": 20,
      "linkType": "internal"
    },
    {
      "id": "city-tours",
      "title": "City Tours",
      "href": "/web/city-tours",
      "section": "applications",
      "iconKey": "tour",
      "visible": true,
      "order": 22,
      "linkType": "internal"
    },
    {
      "id": "solid-health-questionnaire",
      "title": "Health Questionnaire",
      "href": "/web/solid-health-questionnaire",
      "section": "applications",
      "iconKey": "questionnaire",
      "visible": true,
      "order": 24,
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
    "podBaseUrl": "https://solid-community-server.tmdt.info/solidtestpod/statistics/",
    "eventsUrl": "https://solid-community-server.tmdt.info/solidtestpod/statistics/events/catalog-instances/stadt-wuppertal/downloads/",
    "timezone": "Europe/Berlin",
    "activityResourcePath": "statistics/activity/activity.ttl"
  }
};
