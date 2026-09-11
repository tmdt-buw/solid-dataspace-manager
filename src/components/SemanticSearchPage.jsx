import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { SemanticSearchEmbed } from '@hoelk-f/semantic-data-catalog/embed';
import { useI18n } from '../i18n';

export default function SemanticSearchPage({ language }) {
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <div className="semantic-search-page">
      <div className="toolbar toolbar--title">
        <h1 className="crumb">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="crumb-icon" />
          <span>{t('Semantic Search')}</span>
        </h1>
      </div>
      <SemanticSearchEmbed
        language={language}
        onOpenDataset={url => navigate(`/catalog?dataset=${encodeURIComponent(url)}`)}
      />
    </div>
  );
}
