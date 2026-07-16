import React from "react";
import { Navigate } from "react-router-dom";
import { isStatisticsAdmin } from "../config/runtimeConfig";

function StatisticsRouteGuard({ webId, children }) {
  if (!isStatisticsAdmin(webId)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default StatisticsRouteGuard;
