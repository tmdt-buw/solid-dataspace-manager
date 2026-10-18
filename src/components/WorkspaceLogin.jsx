import React, { useEffect, useState } from "react";
import { ensureWorkspaceSession, workspaceReturnTarget } from "../workspaceAccess";
import { useI18n } from "../i18n";
export default function WorkspaceLogin() {
  const [error, setError] = useState(false);
  const { t } = useI18n();
  useEffect(() => {
    let active = true;
    ensureWorkspaceSession().then(() => {
      if (active) window.location.replace(workspaceReturnTarget(new URLSearchParams(window.location.search).get("returnTo")));
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  return <div role={error ? "alert" : "status"}>{t(error ? "Workspace login failed. Please sign in again." : "Loading your personal application workspace …")}</div>;
}
