import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SOLID_TOURS_PATH = "/web/solid-tours";
const SOLID_TOURS_DOCUMENT_CLASS = "solid-tours-route";

const isSolidToursPath = (pathname) =>
  pathname === SOLID_TOURS_PATH || pathname === `${SOLID_TOURS_PATH}/`;

export default function RouteAwareLayout({ children, className = "" }) {
  const { pathname } = useLocation();
  const solidToursRoute = isSolidToursPath(pathname);

  useEffect(() => {
    const roots = [document.documentElement, document.body];

    roots.forEach((root) => {
      root.classList.toggle(SOLID_TOURS_DOCUMENT_CLASS, solidToursRoute);
    });

    return () => {
      roots.forEach((root) => {
        root.classList.remove(SOLID_TOURS_DOCUMENT_CLASS);
      });
    };
  }, [solidToursRoute]);

  const classes = [
    className,
    solidToursRoute ? "layout--solid-tours" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}

