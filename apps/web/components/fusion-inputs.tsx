'use client';

import { useEffect, useId, useState } from 'react';
import { fusionSettingsSchema, runPageSchema, type ExtractionRunDto, type FusionRunDto, type MediaAssetDto } from '@mongolsub/contracts';
import { errorText } from '../lib/api';
import { dateLabel } from '../lib/format';
import { eligibleFusionInput, fusionInputRole, queueFusion, toggleFusionInput } from '../lib/fusion';
import { sourceMethods } from '../lib/extraction';
import { useResource } from '../lib/use-resource';
import { scheduleIdleRefresh } from '../lib/resource-polling';
import { ErrorNotice, LoadingRows } from './ui';

export function FusionInputs({ episodeId, asset, onQueued }: { episodeId: string; asset: MediaAssetDto; onQueued: (run: FusionRunDto) => void }) {
  const id = useId();
  const [offset, setOffset] = useState(0);
  const runs = useResource(`/episodes/${episodeId}/source-extractions?offset=${offset}&limit=25`, runPageSchema);
  const [selected, setSelected] = useState<ExtractionRunDto[]>([]);
  const [language, setLanguage] = useState<'AUTO' | 'ENGLISH' | 'CHINESE'>('AUTO');
  const [advanced, setAdvanced] = useState(false);
  const defaults = fusionSettingsSchema.parse({});
  const [values, setValues] = useState({ embedded: String(defaults.reliability.EMBEDDED_SUBTITLE), asr: String(defaults.reliability.ASR), ocr: String(defaults.reliability.OCR), iou: String(defaults.temporal.minimumIou), agreement: String(defaults.text.agreementThreshold), high: String(defaults.review.highThreshold), problem: String(defaults.review.problemThreshold) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const page = runs.data?.offset === offset ? runs.data : null;
  const available = page?.items.filter(run => eligibleFusionInput(run, asset.id)) ?? [];
  useEffect(() => scheduleIdleRefresh(true, runs.loading, runs.refresh, 10000), [runs.loading, runs.refresh]);
  async function submit() {
    setBusy(true); setError(null);
    try {
      if (selected.some(run => !eligibleFusionInput(run, asset.id))) throw new Error('Select completed runs from this media.');
      if (selected.filter(run => run.method === 'EMBEDDED_SUBTITLE').length > 1) throw new Error('Select at most one embedded subtitle run.');
      if (advanced && Object.values(values).some(value => !value.trim())) throw new Error('Complete every advanced setting or use defaults.');
      const settings = advanced ? { reliability: { EMBEDDED_SUBTITLE: Number(values.embedded), ASR: Number(values.asr), OCR: Number(values.ocr) }, temporal: { minimumIou: Number(values.iou) }, text: { agreementThreshold: Number(values.agreement) }, review: { highThreshold: Number(values.high), problemThreshold: Number(values.problem) } } : {};
      onQueued(await queueFusion(episodeId, { mediaAssetId: asset.id, inputRunIds: selected.map(run => run.id), language, settings }));
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <div className="fusion-inputs"><h3>Build a canonical transcript</h3><p className="field-help">Select the exact completed runs for {asset.originalFilename}. Up to 12 inputs; at most one embedded track. Sources stay immutable.</p>
    <form onSubmit={event => { event.preventDefault(); void submit(); }} aria-busy={busy}>
      <fieldset disabled={busy}><legend>Source evidence</legend>{runs.error && <ErrorNotice message={runs.error} retry={runs.refresh} />}{runs.loading && !page ? <LoadingRows /> : available.length ? available.map(run => {
        const checked = selected.some(item => item.id === run.id);
        const stream = asset.streams?.find(item => item.streamIndex === run.streamIndex);
        return <label className="track-choice fusion-choice" key={run.id}><input type="checkbox" checked={checked} disabled={!checked && (selected.length >= 12 || (run.method === 'EMBEDDED_SUBTITLE' && selected.some(item => item.method === 'EMBEDDED_SUBTITLE')))} onChange={event => setSelected(previous => toggleFusionInput(previous, run, event.target.checked))} /><span><strong>{sourceMethods[run.method]} · {run.languageDetected ?? run.languageRequested ?? 'Language unknown'}{run.streamIndex === null ? '' : ` · Stream #${run.streamIndex}`}</strong><small>{[stream?.title, run.provider, run.providerVersion, run.modelVersion].filter(Boolean).join(' · ')}</small><small>{run.segmentCount} segments · {dateLabel(run.createdAt)} · Run {run.id.slice(0, 8)} · {fusionInputRole(run.languageDetected ?? run.languageRequested, language)}</small></span></label>;
      }) : <p className="field-help">No completed extraction runs for this media on this page. Complete a source extraction or browse another page.</p>}</fieldset>
      {page && page.total > 25 && <div className="source-pagination"><button type="button" className="button secondary" disabled={runs.loading || offset === 0} onClick={() => setOffset(previous => Math.max(0, previous - 25))}>Previous sources</button><span className="muted">{offset + 1}–{Math.min(offset + 25, page.total)} of {page.total} history entries</span><button type="button" className="button secondary" disabled={runs.loading || offset + 25 >= page.total} onClick={() => setOffset(previous => previous + 25)}>Next sources</button></div>}
      <div className="fusion-selection"><strong>{selected.length} selected</strong>{selected.map(run => <span className="fusion-selected-input" key={run.id}>{sourceMethods[run.method]} {run.id.slice(0, 8)}<button type="button" disabled={busy} aria-label={`Remove source run ${run.id.slice(0, 8)}`} onClick={() => setSelected(previous => previous.filter(item => item.id !== run.id))}>×</button></span>)}</div>
      <div className="field"><label htmlFor={`${id}-language`}>Canonical language</label><select id={`${id}-language`} value={language} disabled={busy} onChange={event => setLanguage(event.target.value === 'ENGLISH' ? 'ENGLISH' : event.target.value === 'CHINESE' ? 'CHINESE' : 'AUTO')}><option value="AUTO">Auto · resolve from selected evidence</option><option value="ENGLISH">English</option><option value="CHINESE">Chinese</option></select><p className="field-help">English and Chinese never vote on each other’s text. Other or unknown languages contribute timing only. Chinese scripts remain as supplied.</p></div>
      <details className="fusion-advanced"><summary>Algorithm settings</summary><label className="check-field"><input type="checkbox" checked={advanced} disabled={busy} onChange={event => setAdvanced(event.target.checked)} />Customize reproducible thresholds</label><p className="field-help">Heuristic confidence is not a probability of correctness. Defaults and every setting are saved with the run.</p>{advanced && <div className="fusion-settings-grid">{([
        ['embedded', 'Embedded reliability'], ['asr', 'ASR reliability'], ['ocr', 'OCR reliability'], ['iou', 'Minimum temporal IoU'], ['agreement', 'Text agreement threshold'], ['high', 'High confidence threshold'], ['problem', 'Problem threshold'],
      ] as const).map(([key, label]) => <div className="field" key={key}><label htmlFor={`${id}-${key}`}>{label}</label><input id={`${id}-${key}`} type="number" min={key === 'embedded' || key === 'asr' || key === 'ocr' ? 0.1 : 0} max={1} step={0.01} required disabled={busy} value={values[key]} onChange={event => setValues(previous => ({ ...previous, [key]: event.target.value }))} /></div>)}</div>}</details>
      {error && <ErrorNotice message={error} />}<button className="button primary" disabled={busy || !selected.length || asset.status !== 'READY'}>{busy ? 'Saving transcript run…' : 'Build transcript'}</button><p className="field-help">Matching requests reuse their existing run. Run again creates a separate revision; activation is always explicit.</p>
    </form>
  </div>;
}
