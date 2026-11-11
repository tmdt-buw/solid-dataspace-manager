import React, {useState} from 'react';
import {useI18n} from '../i18n';
import {createDaceProfile, createProfile, duplicateProfile, createField, createValue, moveItem, labelFor} from '../catalogMetadata/model';
import './CatalogProfileEditor.css';

export default function CatalogProfileEditor({catalog, origin, disabled, onChange}) {
  const {language} = useI18n();
  const tr = (de, en) => language === 'de' ? de : en;
  const profiles = catalog.metadataProfiles || [];
  const [editing, setEditing] = useState(catalog.metadataProfile || profiles[0]?.id || '');
  const [preview, setPreview] = useState(false);
  const profile = profiles.find(p => p.id === editing);
  const change = (id, next) => onChange({...catalog, metadataProfiles: profiles.map(p => p.id === id ? next : p)});
  const add = value => { onChange({...catalog, metadataProfiles: [...profiles, value]}); setEditing(value.id); };
  const updateField = (index, value) => change(profile.id, {...profile, fields: profile.fields.map((f, i) => i === index ? value : f)});
  function texts(label, value, onEdit, help = false) {
    return <div className="catalog-profile-languages">{['de', 'en'].map(lang => <label className="admin-field" key={lang}>
      <span>{label} ({lang === 'de' ? 'Deutsch' : 'English'})</span>
      <input maxLength={help ? 800 : 160} value={value?.[lang] || ''} onChange={e => onEdit({...value, [lang]: e.target.value})}/>
    </label>)}</div>;
  }
  const toggle = (label, value, onEdit) => <label className="catalog-profile-toggle"><input type="checkbox" checked={value} onChange={e => onEdit(e.target.checked)}/><span>{label}</span></label>;
  return <section className="admin-panel catalog-profile-editor" translate="no">
    <h2>{tr('Katalogprofil', 'Catalog profile')}</h2>
    <p className="admin-hint">{tr('Zusätzliche Kategorien für dieses Instanzprofil. Daten und Freigaben werden dadurch nicht verändert.', 'Additional categories for this instance profile. Data and access permissions are not changed.')}</p>
    <fieldset disabled={disabled}>
      <label className="admin-field"><span>{tr('Im Katalog verwenden', 'Use in catalog')}</span><select aria-label={tr('Im Katalog verwenden', 'Use in catalog')} value={catalog.metadataProfile || ''} onChange={e => onChange({...catalog, metadataProfile: e.target.value})}>
        <option value="">{tr('Standard', 'Standard')}</option>{profiles.filter(p => p.enabled).map(p => <option key={p.id} value={p.id}>{labelFor(p.label, language)}</option>)}
      </select></label>
      <div className="catalog-profile-toolbar">
        <button className="admin-btn" type="button" disabled={profiles.length >= 8 || profiles.some(p => p.id === 'dace-ce-v1')} onClick={() => add(createDaceProfile(origin))}>{tr('DACE-Vorlage hinzufügen', 'Add DACE template')}</button>
        <button className="admin-btn" type="button" disabled={profiles.length >= 8} onClick={() => add(createProfile(origin))}>{tr('Katalogprofil hinzufügen', 'Add catalog profile')}</button>
      </div>
      {profiles.length > 0 && <label className="admin-field"><span>{tr('Katalogprofil bearbeiten', 'Edit catalog profile')}</span><select aria-label={tr('Katalogprofil bearbeiten', 'Edit catalog profile')} value={editing} onChange={e => setEditing(e.target.value)}><option value="">{tr('Auswählen', 'Select')}</option>{profiles.map(p => <option key={p.id} value={p.id}>{labelFor(p.label, language)}{p.enabled ? '' : tr(' (deaktiviert)', ' (disabled)')}</option>)}</select></label>}
      {profile && <>
        {texts(tr('Profilname', 'Profile name'), profile.label, label => change(profile.id, {...profile, label}))}
        <div className="catalog-profile-toolbar">
          {toggle(tr('Profil aktiv', 'Profile enabled'), profile.enabled, enabled => onChange({...catalog, metadataProfile: !enabled && catalog.metadataProfile === profile.id ? '' : catalog.metadataProfile, metadataProfiles: profiles.map(p => p.id === profile.id ? {...p, enabled} : p)}))}
          <button type="button" className="admin-btn" disabled={profiles.length >= 8} onClick={() => add(duplicateProfile(profile))}>{tr('Duplizieren', 'Duplicate')}</button>
          <button type="button" className="admin-btn" aria-expanded={preview} onClick={() => setPreview(!preview)}>{tr('Formularvorschau', 'Form preview')}</button>
        </div>
        <p className="admin-hint">{tr('Umbenennen erhält vorhandene Zuordnungen. Deaktivierte Kategorien und Werte bleiben für bestehende Datensätze gespeichert. Pflichtfelder gelten für neue Einträge; Altbestände bleiben bearbeitbar.', 'Renaming preserves existing assignments. Disabled categories and values remain stored for existing datasets. Required fields apply to new entries; existing entries remain editable.')}</p>
        {preview && <section className="catalog-profile-preview" aria-label={tr('Formularvorschau', 'Form preview')}><h3>{labelFor(profile.label, language)}</h3><div className="catalog-profile-languages">{profile.fields.filter(f => f.enabled && f.form).map(f => <label className="admin-field" key={f.id}><span>{labelFor(f.label, language)}{f.required ? ' *' : ''}</span><select aria-label={labelFor(f.label, language)} defaultValue=""><option value="">{tr('Auswählen', 'Select')}{f.multiple ? tr(' (Mehrfachauswahl)', ' (multiple values)') : ''}</option>{f.values.filter(v => v.enabled).map(v => <option key={v.id}>{labelFor(v.label, language)}</option>)}</select><small>{labelFor(f.help, language)}</small></label>)}</div></section>}
        {profile.fields.map((field, index) => <details className="catalog-profile-category" key={field.id}>
          <summary>{labelFor(field.label, language)}{!field.enabled && tr(' (deaktiviert)', ' (disabled)')}<span>{field.values.length} {tr('Werte', 'values')}</span></summary>
          <div className="catalog-profile-category-body">
            <div className="catalog-profile-toolbar"><button className="admin-btn" type="button" disabled={index === 0} aria-label={tr('Kategorie nach oben', 'Move category up')} onClick={() => change(profile.id, {...profile, fields: moveItem(profile.fields, index, -1)})}>↑</button><button className="admin-btn" type="button" disabled={index === profile.fields.length - 1} aria-label={tr('Kategorie nach unten', 'Move category down')} onClick={() => change(profile.id, {...profile, fields: moveItem(profile.fields, index, 1)})}>↓</button></div>
            {texts(tr('Kategorie', 'Category'), field.label, label => updateField(index, {...field, label}))}
            {texts(tr('Hilfetext', 'Help text'), field.help, help => updateField(index, {...field, help}), true)}
            <div className="catalog-profile-switches">{[['enabled', tr('Kategorie aktiv', 'Category enabled')], ['multiple', tr('Mehrfachauswahl', 'Multiple selection')], ['required', tr('Pflichtfeld für neue Einträge', 'Required for new entries')], ['form', tr('Im Formular', 'In forms')], ['details', tr('In den Details', 'In details')], ['filter', tr('Als Filter', 'As a filter')]].map(([key, label]) => <React.Fragment key={key}>{toggle(label, field[key], value => updateField(index, {...field, [key]: value, ...((key === 'enabled' || key === 'form') && !value ? {required: false} : {}), ...(key === 'required' && value ? {enabled: true, form: true} : {})}))}</React.Fragment>)}</div>
            <div className="catalog-profile-values">{field.values.map((value, vi) => <div className="catalog-profile-value" key={value.id}>
              {texts(tr('Auswahlwert', 'Option'), value.label, label => updateField(index, {...field, values: field.values.map(v => v.id === value.id ? {...v, label} : v)}))}
              <div className="catalog-profile-toolbar">{toggle(tr('Wert aktiv', 'Option enabled'), value.enabled, enabled => updateField(index, {...field, values: field.values.map(v => v.id === value.id ? {...v, enabled} : v)}))}{toggle(tr('Nur allein auswählbar', 'Exclusive option'), value.exclusive, exclusive => updateField(index, {...field, values: field.values.map(v => v.id === value.id ? {...v, exclusive} : v)}))}<button className="admin-btn" type="button" disabled={vi === 0} aria-label={tr('Wert nach oben', 'Move option up')} onClick={() => updateField(index, {...field, values: moveItem(field.values, vi, -1)})}>↑</button><button className="admin-btn" type="button" disabled={vi === field.values.length - 1} aria-label={tr('Wert nach unten', 'Move option down')} onClick={() => updateField(index, {...field, values: moveItem(field.values, vi, 1)})}>↓</button></div>
            </div>)}</div>
            <button type="button" className="admin-btn" disabled={field.values.length >= 80} onClick={() => updateField(index, {...field, values: [...field.values, createValue(field)]})}>{tr('Auswahlwert hinzufügen', 'Add option')}</button>
          </div>
        </details>)}
        <button type="button" className="admin-btn" disabled={profile.fields.length >= 24} onClick={() => change(profile.id, {...profile, fields: [...profile.fields, createField(profile, origin)]})}>{tr('Kategorie hinzufügen', 'Add category')}</button>
      </>}
    </fieldset>
  </section>;
}
