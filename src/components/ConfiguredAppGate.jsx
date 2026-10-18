import React from 'react';
import { useLocation } from 'react-router-dom';
import { isAppEnabled } from '../config/runtimeConfig';

export default function ConfiguredAppGate({ children }) {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/+$/, '') || '/';
  const id = path === '/' ? 'solid-data-manager' : path === '/data-connection' ? 'data-connection'
    : path.startsWith('/web/') ? path.split('/')[2] : '';
  return id && !isAppEnabled(id)
    ? <p role="status">This application is disabled for this Dataspace.</p>
    : children;
}
