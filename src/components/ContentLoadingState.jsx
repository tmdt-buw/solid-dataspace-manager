import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHexagonNodes } from "@fortawesome/free-solid-svg-icons";
import { useI18n } from "../i18n";
import { getApplicationIcon } from "../config/appIcons";
import "./ContentLoadingState.css";

export default function ContentLoadingState({
  title,
  message = "Loading your personal application workspace …",
  icon = faHexagonNodes,
  appId,
  variant = "page",
  className = "",
}) {
  const { t } = useI18n();
  const translatedTitle = t(title);
  const translatedMessage = t(message);
  const Heading = variant === "compact" ? "strong" : "h1";
  const Root = variant === "page" ? "main" : "div";
  const classes = [
    "dataspace-content-loading",
    `dataspace-content-loading--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Root
      className={classes}
      aria-busy="true"
    >
      <span className="dataspace-content-loading__mark" aria-hidden="true">
        <FontAwesomeIcon icon={appId ? getApplicationIcon(appId) : icon} />
      </span>
      <Heading className="dataspace-content-loading__title">
        {translatedTitle}
      </Heading>
      <p
        className="dataspace-content-loading__message"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {translatedMessage}
      </p>
      <span
        className="dataspace-content-loading__rail"
        role="progressbar"
        aria-label={translatedMessage}
      >
        <span />
      </span>
    </Root>
  );
}
