'use client';

import { useId, useState, type FormEvent } from 'react';
import { createSeriesSchema, createEpisodeSchema, seriesSchema, episodeSchema, type SeriesDto, type EpisodeDto } from '@mongolsub/contracts';
import { errorText, request } from '../lib/api';
import { ErrorNotice } from './ui';

type FieldErrors = Record<string, string>;

export function SeriesForm({ series, onSaved, onCancel }: { series?: SeriesDto; onSaved: (value: SeriesDto) => void; onCancel: () => void }) {
  const id = useId();
  const [title, setTitle] = useState(series?.title || '');
  const [description, setDescription] = useState(series?.description || '');
  const [language, setLanguage] = useState(series?.sourceLanguage || '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const payload = () => ({ title, description: description.trim() || null, sourceLanguage: language.trim() || null });
  function validate(field?: string) {
    const result = createSeriesSchema.safeParse(payload());
    const next: FieldErrors = {};
    if (!result.success) for (const issue of result.error.issues) next[String(issue.path[0])] = issue.message;
    setErrors(previous => field ? { ...previous, [field]: next[field] || '' } : next);
    return result;
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = validate();
    if (!result.success) return;
    setBusy(true); setError(null);
    try { onSaved(await request(series ? `/series/${series.id}` : '/series', seriesSchema, { method: series ? 'PATCH' : 'POST', body: result.data })); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <section className="form-panel"><h2>{series ? 'Series settings' : 'Create series'}</h2><form onSubmit={submit} noValidate aria-busy={busy}>
    <div className="form-grid"><div className="field"><label htmlFor={`${id}-title`}>Series title <span className="muted">(required)</span></label><input autoFocus id={`${id}-title`} value={title} maxLength={200} required aria-required="true" aria-invalid={!!errors.title} aria-describedby={`${id}-title-help`} onChange={event => { setTitle(event.target.value); setErrors(value => ({ ...value, title: '' })); }} onBlur={() => validate('title')} /><p className={errors.title ? 'field-help error-text' : 'field-help'} id={`${id}-title-help`}>{errors.title || 'The title shown in your library.'}</p></div>
    <div className="field"><label htmlFor={`${id}-language`}>Source language</label><input id={`${id}-language`} value={language} list={`${id}-languages`} maxLength={35} placeholder="en, zh-CN, zh-TW" aria-invalid={!!errors.sourceLanguage} aria-describedby={`${id}-language-help`} onChange={event => { setLanguage(event.target.value); setErrors(value => ({ ...value, sourceLanguage: '' })); }} onBlur={() => validate('sourceLanguage')} /><datalist id={`${id}-languages`}><option value="en">English</option><option value="zh-CN">Simplified Chinese</option><option value="zh-TW">Traditional Chinese</option></datalist><p className={errors.sourceLanguage ? 'field-help error-text' : 'field-help'} id={`${id}-language-help`}>{errors.sourceLanguage || 'Optional language identifier; additional languages are supported.'}</p></div>
    <div className="field full"><label htmlFor={`${id}-description`}>Description</label><textarea id={`${id}-description`} value={description} maxLength={4000} aria-invalid={!!errors.description} aria-describedby={`${id}-description-help`} onChange={event => setDescription(event.target.value)} onBlur={() => validate('description')} /><p className={errors.description ? 'field-help error-text' : 'field-help'} id={`${id}-description-help`}>{errors.description || 'Optional notes about the series.'}</p></div></div>
    {error && <ErrorNotice message={error} />}<div className="form-actions"><button className="button primary" disabled={busy} type="submit">{busy ? 'Saving…' : series ? 'Save series' : 'Create series'}</button><button className="button secondary" type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </form></section>;
}

export function EpisodeForm({ seriesId, episode, onSaved, onCancel }: { seriesId: string; episode?: EpisodeDto; onSaved: (value: EpisodeDto) => void; onCancel: () => void }) {
  const id = useId();
  const [title, setTitle] = useState(episode?.title || '');
  const [number, setNumber] = useState(episode?.episodeNumber?.toString() || '');
  const [language, setLanguage] = useState(episode?.sourceLanguage || '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  function validate(field?: string) {
    const result = createEpisodeSchema.safeParse({ title, episodeNumber: number.trim() ? Number(number) : null, sourceLanguage: language || null });
    const next: FieldErrors = {};
    if (!result.success) for (const issue of result.error.issues) next[String(issue.path[0])] = issue.message;
    setErrors(previous => field ? { ...previous, [field]: next[field] || '' } : next);
    return result;
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = validate();
    if (!result.success) return;
    setBusy(true); setError(null);
    try { onSaved(await request(episode ? `/episodes/${episode.id}` : `/series/${seriesId}/episodes`, episodeSchema, { method: episode ? 'PATCH' : 'POST', body: result.data })); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <section className="form-panel"><h2>{episode ? 'Episode settings' : 'Create episode'}</h2><form onSubmit={submit} noValidate aria-busy={busy}><div className="form-grid">
    <div className="field"><label htmlFor={`${id}-title`}>Episode title <span className="muted">(required)</span></label><input autoFocus id={`${id}-title`} value={title} maxLength={200} required aria-required="true" aria-invalid={!!errors.title} aria-describedby={`${id}-title-help`} onChange={event => { setTitle(event.target.value); setErrors(value => ({ ...value, title: '' })); }} onBlur={() => validate('title')} /><p id={`${id}-title-help`} className={errors.title ? 'field-help error-text' : 'field-help'}>{errors.title || 'Use a title that identifies the episode.'}</p></div>
    <div className="field"><label htmlFor={`${id}-number`}>Episode number</label><input id={`${id}-number`} type="number" min={1} max={100000} step={1} value={number} aria-invalid={!!errors.episodeNumber} aria-describedby={`${id}-number-help`} onChange={event => { setNumber(event.target.value); setErrors(value => ({ ...value, episodeNumber: '' })); }} onBlur={() => validate('episodeNumber')} /><p id={`${id}-number-help`} className={errors.episodeNumber ? 'field-help error-text' : 'field-help'}>{errors.episodeNumber || 'Optional positive whole number.'}</p></div>
    <div className="field"><label htmlFor={`${id}-language`}>Declared source language</label><select id={`${id}-language`} value={language} disabled={busy} onChange={event => setLanguage(event.target.value)}><option value="">Auto / inherit series declaration</option><option value="en">English</option><option value="zh">Chinese</option><option value="zh-CN">Simplified Chinese</option><option value="zh-TW">Traditional Chinese</option>{language && !['en', 'zh', 'zh-CN', 'zh-TW'].includes(language) && <option value={language}>{language}</option>}</select><p className={errors.sourceLanguage ? 'field-help error-text' : 'field-help'}>{errors.sourceLanguage || 'Optional tie context for Auto reconciliation. It does not translate source text.'}</p></div>
    </div>{error && <ErrorNotice message={error} />}<div className="form-actions"><button type="submit" className="button primary" disabled={busy}>{busy ? 'Saving…' : episode ? 'Save episode' : 'Create episode'}</button><button type="button" className="button secondary" disabled={busy} onClick={onCancel}>Cancel</button></div></form></section>;
}
