import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLink, faXmark } from "@fortawesome/free-solid-svg-icons";
import session from "../solidSession";
import {
  loadHomeAssistantConnection,
  saveHomeAssistantConnection,
} from "../solidConnections";
import "./DataConnection.css";

const HOME_ASSISTANT_LOGO =
  "https://brands.home-assistant.io/homeassistant/icon.png";

function HomeAssistantModal({
  open,
  url,
  port,
  saving,
  error,
  onUrlChange,
  onPortChange,
  onClose,
  onSubmit,
}) {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="data-connection-modalOverlay" role="presentation">
      <div
        className="data-connection-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="homeassistant-modal-title"
      >
        <div className="data-connection-modal__head">
          <div className="data-connection-modal__title">
            <img src={HOME_ASSISTANT_LOGO} alt="" aria-hidden="true" />
            <h2 id="homeassistant-modal-title">Homeassistant</h2>
          </div>
          <button
            type="button"
            className="data-connection-modal__close"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            disabled={saving}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <form className="data-connection-form" onSubmit={onSubmit}>
          <label>
            <span>URL</span>
            <input
              type="text"
              value={url}
              onChange={(event) => onUrlChange(event.target.value)}
              placeholder="http://homeassistant.local"
              autoComplete="url"
              autoFocus
              disabled={saving}
            />
          </label>

          <label>
            <span>Port</span>
            <input
              type="number"
              min="1"
              max="65535"
              value={port}
              onChange={(event) => onPortChange(event.target.value)}
              placeholder="8123"
              disabled={saving}
            />
          </label>

          {error ? <div className="data-connection-form__error">{error}</div> : null}

          <div className="data-connection-form__actions">
            <button
              type="button"
              className="data-connection-btn data-connection-btn--secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="data-connection-btn data-connection-btn--primary"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DataConnection({ webId }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [port, setPort] = useState("8123");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadConnection = async () => {
      if (!webId) return;

      setError("");
      try {
        const connection = await loadHomeAssistantConnection(webId, session.fetch);
        if (!cancelled && connection) {
          setUrl(connection.url || "");
          setPort(connection.port || "8123");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Connection could not be loaded.");
        }
      }
    };

    loadConnection();

    return () => {
      cancelled = true;
    };
  }, [webId]);

  const openModal = () => {
    setError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    try {
      setSaving(true);
      const connection = await saveHomeAssistantConnection(webId, session.fetch, {
        url,
        port,
      });
      setUrl(connection?.url || url);
      setPort(connection?.port || port);
      setModalOpen(false);
    } catch (err) {
      setError(err?.message || "Connection could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="data-connection">
      <div className="toolbar toolbar--title data-connection__header">
        <div className="crumb">
          <FontAwesomeIcon icon={faLink} className="crumb-icon" />
          <span>Data Connection</span>
        </div>
      </div>

      <div className="data-connection__shell">
        <div className="data-connection__grid">
          <button
            type="button"
            className="data-connection-card"
            onClick={openModal}
            title="Homeassistant"
          >
            <span className="data-connection-card__icon">
              <img src={HOME_ASSISTANT_LOGO} alt="Home Assistant logo" />
            </span>
            <strong>Homeassistant</strong>
          </button>
        </div>
      </div>

      <HomeAssistantModal
        open={modalOpen}
        url={url}
        port={port}
        saving={saving}
        error={error}
        onUrlChange={setUrl}
        onPortChange={setPort}
        onClose={closeModal}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

export default DataConnection;
