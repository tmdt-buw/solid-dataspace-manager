import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";

const CITY_TOURS_PATH = "/web/city-tours";
const CITY_TOURS_DOCUMENT_CLASS = "city-tours-route";
const DATA_MANAGER_PATH = "/";
const CATALOG_PATH = "/catalog";
const CATALOG_DOCUMENT_CLASS = "catalog-route";
const HEALTH_QUESTIONNAIRE_PATH = "/web/solid-health-questionnaire";
const HEALTH_QUESTIONNAIRE_DOCUMENT_CLASS = "health-questionnaire-route";
const SHELL_DOCUMENT_CLASS = "dataspace-shell-active";

const isCityToursPath = (pathname) =>
  pathname === CITY_TOURS_PATH || pathname === `${CITY_TOURS_PATH}/`;

const isDataManagerPath = (pathname) => pathname === DATA_MANAGER_PATH;

const isCatalogPath = (pathname) =>
  pathname === CATALOG_PATH || pathname === `${CATALOG_PATH}/`;

const isHealthQuestionnairePath = (pathname) =>
  pathname === HEALTH_QUESTIONNAIRE_PATH ||
  pathname === `${HEALTH_QUESTIONNAIRE_PATH}/`;

export default function RouteAwareLayout({ children, className = "" }) {
  const { pathname } = useLocation();
  const dataManagerRoute = isDataManagerPath(pathname);
  const cityToursRoute = isCityToursPath(pathname);
  const catalogRoute = isCatalogPath(pathname);
  const healthQuestionnaireRoute = isHealthQuestionnairePath(pathname);

  useEffect(() => {
    const roots = [document.documentElement, document.body];

    roots.forEach((root) => {
      root.classList.add(SHELL_DOCUMENT_CLASS);
      root.classList.toggle(CITY_TOURS_DOCUMENT_CLASS, cityToursRoute);
      root.classList.toggle(CATALOG_DOCUMENT_CLASS, catalogRoute);
      root.classList.toggle(
        HEALTH_QUESTIONNAIRE_DOCUMENT_CLASS,
        healthQuestionnaireRoute
      );
    });

    return () => {
      roots.forEach((root) => {
        root.classList.remove(SHELL_DOCUMENT_CLASS);
        root.classList.remove(CITY_TOURS_DOCUMENT_CLASS);
        root.classList.remove(CATALOG_DOCUMENT_CLASS);
        root.classList.remove(HEALTH_QUESTIONNAIRE_DOCUMENT_CLASS);
      });
    };
  }, [catalogRoute, healthQuestionnaireRoute, cityToursRoute]);

  const classes = [
    className,
    dataManagerRoute ? "layout--data-manager" : "",
    cityToursRoute ? "layout--city-tours" : "",
    catalogRoute ? "layout--catalog" : "",
    healthQuestionnaireRoute ? "layout--health-questionnaire" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}
