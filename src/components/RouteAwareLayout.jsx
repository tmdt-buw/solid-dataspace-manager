import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SOLID_TOURS_PATH = "/web/solid-tours";
const SOLID_TOURS_DOCUMENT_CLASS = "solid-tours-route";
const DATA_MANAGER_PATH = "/";
const CATALOG_PATH = "/catalog";
const CATALOG_DOCUMENT_CLASS = "catalog-route";
const HEALTH_QUESTIONNAIRE_PATH = "/web/solid-health-questionnaire";
const HEALTH_QUESTIONNAIRE_DOCUMENT_CLASS = "health-questionnaire-route";
const SHELL_DOCUMENT_CLASS = "dataspace-shell-active";

const isSolidToursPath = (pathname) =>
  pathname === SOLID_TOURS_PATH || pathname === `${SOLID_TOURS_PATH}/`;

const isDataManagerPath = (pathname) => pathname === DATA_MANAGER_PATH;

const isCatalogPath = (pathname) =>
  pathname === CATALOG_PATH || pathname === `${CATALOG_PATH}/`;

const isHealthQuestionnairePath = (pathname) =>
  pathname === HEALTH_QUESTIONNAIRE_PATH ||
  pathname === `${HEALTH_QUESTIONNAIRE_PATH}/`;

export default function RouteAwareLayout({ children, className = "" }) {
  const { pathname } = useLocation();
  const dataManagerRoute = isDataManagerPath(pathname);
  const solidToursRoute = isSolidToursPath(pathname);
  const catalogRoute = isCatalogPath(pathname);
  const healthQuestionnaireRoute = isHealthQuestionnairePath(pathname);

  useEffect(() => {
    const roots = [document.documentElement, document.body];

    roots.forEach((root) => {
      root.classList.add(SHELL_DOCUMENT_CLASS);
      root.classList.toggle(SOLID_TOURS_DOCUMENT_CLASS, solidToursRoute);
      root.classList.toggle(CATALOG_DOCUMENT_CLASS, catalogRoute);
      root.classList.toggle(
        HEALTH_QUESTIONNAIRE_DOCUMENT_CLASS,
        healthQuestionnaireRoute
      );
    });

    return () => {
      roots.forEach((root) => {
        root.classList.remove(SHELL_DOCUMENT_CLASS);
        root.classList.remove(SOLID_TOURS_DOCUMENT_CLASS);
        root.classList.remove(CATALOG_DOCUMENT_CLASS);
        root.classList.remove(HEALTH_QUESTIONNAIRE_DOCUMENT_CLASS);
      });
    };
  }, [catalogRoute, healthQuestionnaireRoute, solidToursRoute]);

  const classes = [
    className,
    dataManagerRoute ? "layout--data-manager" : "",
    solidToursRoute ? "layout--solid-tours" : "",
    catalogRoute ? "layout--catalog" : "",
    healthQuestionnaireRoute ? "layout--health-questionnaire" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}
