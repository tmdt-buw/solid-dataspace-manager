import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SemanticSearchEmbed } from '@hoelk-f/semantic-data-catalog/embed';

export default function SemanticSearchPage({ language }) {
  const navigate = useNavigate();
  return <div className="data-catalog-embed"><SemanticSearchEmbed language={language}
    onOpenDataset={url => navigate(`/catalog?dataset=${encodeURIComponent(url)}`)} />
  </div>;
}
