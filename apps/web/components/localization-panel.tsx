'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  fusionPageSchema, localizedSegmentPageSchema, localizationPageSchema, localizationProviderReadinessSchema,
  localizationRunSchema, type FusionRunDto, type LocalizedSegmentDto, type LocalizationMode,
  type LocalizationRunDto,
} from '@mongolsub/contracts';
import { ApiError, errorText, request } from '../lib/api';
import { dateLabel } from '../lib/format';
import {
  approveLocalizedSegment, localizationActive, localizationFilterLabels, localizationReviewLabels,
  progressLabel, saveLocalizedSegment, selectedLocalizationId, type LocalizationFilter,
} from '../lib/localization';
import { scheduleIdleRefresh } from '../lib/resource-polling';
import { useResource } from '../lib/use-resource';
import { sourceTimestamp } from '../lib/extraction';
import { ErrorNotice, LoadingRows, StatusBadge } from './ui';

const modeCopy: Record<LocalizationMode, string> = {
  STRICT: 'Stay close to the source while producing grammatical Mongolian.',
  NATURAL: 'Preserve meaning in natural, concise spoken Mongolian.',
  CINEMATIC: 'Polish awkward dialogue while preserving every story fact.',
};

function SegmentRow({ initial, onChanged }: { initial: LocalizedSegmentDto; onChanged: () => void }) {
  const [segment, setSegment] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(initial.currentText ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  async function save() {
    setBusy(true); setError(null); setConflict(false);
    try { const next = await saveLocalizedSegment(segment, text); setSegment(next); setText(next.currentText ?? ''); setEditing(false); onChanged(); }
    catch (cause) { setConflict(cause instanceof ApiError && cause.status === 409); setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  async function approve() {
    setBusy(true); setError(null); setConflict(false);
    try { const next = await approveLocalizedSegment(segment); setSegment(next); onChanged(); }
    catch (cause) { setConflict(cause instanceof ApiError && cause.status === 409); setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  return <article className="localization-segment">
    <header><span className="mono">{sourceTimestamp(segment.sourceStartMs)} → {sourceTimestamp(segment.sourceEndMs)}</span><span>#{segment.sequence + 1}</span></header>
    <div className="localization-columns"><section><h4>Source</h4><p>{segment.sourceTextSnapshot}</p><small>{segment.sourceSpeaker ?? 'Speaker unknown'} · source confidence {Math.round(segment.sourceConfidence * 100)}%</small></section><section><h4>Mongolian</h4>{editing ? <textarea aria-label={`Mongolian line ${segment.sequence + 1}`} value={text} maxLength={20000} disabled={busy} onChange={event => setText(event.target.value)} /> : <p lang="mn">{segment.currentText}</p>}<small>{segment.characterCount ?? 0} characters · revision {segment.revision}</small></section></div>
    <div className="localization-line-meta"><span className={`review-category ${(segment.reviewClassification ?? 'review_recommended').toLowerCase()}`}>{segment.reviewClassification ? localizationReviewLabels[segment.reviewClassification] : 'Awaiting quality review'}</span><span>Human: {segment.humanReviewState.toLowerCase()}</span><span>{segment.editState.replaceAll('_', ' ').toLowerCase()}</span>{segment.readingLoad !== null && <span>Reading load {segment.readingLoad.toFixed(1)}</span>}</div>
    {segment.confidenceReasons.length > 0 && <details><summary>Quality reasons ({segment.confidenceReasons.length})</summary><ul>{segment.confidenceReasons.map((reason, index) => <li key={`${reason.code}-${index}`}><strong>{reason.code.replaceAll('_', ' ')}</strong> — {reason.message}</li>)}</ul></details>}
    {segment.alternativeTranslation && <details><summary>Translation alternative</summary><p lang="mn">{segment.alternativeTranslation}</p></details>}
    {error && <ErrorNotice message={error} />}{conflict && <p className="field-help">This line changed in another view. Refresh the page before saving or approving.</p>}
    <div className="form-actions">{editing ? <><button className="button primary" disabled={busy || !text.trim() || text.trim() === segment.currentText} onClick={() => void save()}>{busy ? 'Saving…' : 'Save edit'}</button><button className="button secondary" disabled={busy} onClick={() => { setText(segment.currentText ?? ''); setEditing(false); setError(null); }}>Cancel</button></> : <button className="button secondary" disabled={busy} onClick={() => setEditing(true)}>Edit Mongolian</button>}<button className="button secondary" disabled={busy || editing || segment.humanReviewState === 'APPROVED'} onClick={() => void approve()}>{segment.humanReviewState === 'APPROVED' ? 'Approved' : 'Approve segment'}</button></div>
  </article>;
}

function LocalizationSegments({ run }: { run: LocalizationRunDto }) {
  const fieldId = useId();
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<LocalizationFilter>('ALL');
  const page = useResource(`/localization-runs/${run.id}/segments?offset=${offset}&limit=25&filter=${filter}`, localizedSegmentPageSchema);
  const current = page.data?.offset === offset && page.data.run.id === run.id ? page.data : null;
  return <div className="localization-review"><div className="source-list-heading"><h3>Source | Mongolian <span className="count">{current?.total ?? '…'}</span></h3><div className="field"><label htmlFor={`${fieldId}-filter`}>Issue filter</label><select id={`${fieldId}-filter`} value={filter} onChange={event => { setFilter(event.target.value as LocalizationFilter); setOffset(0); }}>{Object.entries(localizationFilterLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
    {page.error ? <ErrorNotice message={page.error} retry={page.refresh} /> : page.loading ? <LoadingRows /> : current && <>{current.items.length ? <div className="localization-lines">{current.items.map(segment => <SegmentRow key={`${segment.id}-${segment.revision}`} initial={segment} onChanged={page.refresh} />)}</div> : <p className="panel-empty">No lines match this filter.</p>}{current.total > 25 && <div className="source-pagination"><button className="button secondary" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 25))}>Previous lines</button><span>{offset + 1}–{Math.min(offset + 25, current.total)} of {current.total}</span><button className="button secondary" disabled={offset + 25 >= current.total} onClick={() => setOffset(value => value + 25)}>Next lines</button></div>}</>}
  </div>;
}

function RunInspector({ runId, activeRunId, onChanged, onActivated }: { runId: string; activeRunId: string | null; onChanged: () => void; onActivated: (id: string) => void }) {
  const resource = useResource(`/localization-runs/${runId}`, localizationRunSchema);
  const run = resource.data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => scheduleIdleRefresh(!!run && localizationActive(run), resource.loading, resource.refresh, 2000), [run?.status, resource.loading, resource.refresh]);
  useEffect(() => { if (run && !localizationActive(run)) onChanged(); }, [run?.status, onChanged]);
  async function action(kind: 'activate' | 'cancel' | 'resume') {
    if (!run) return;
    setBusy(true); setError(null);
    try { const next = await request(`/localization-runs/${run.id}/${kind}`, localizationRunSchema, { method: 'POST', body: {} }); resource.setData(next); if (kind === 'activate') onActivated(next.id); onChanged(); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  return <article className="run-inspector localization-run">{resource.error ? <ErrorNotice message={resource.error} retry={resource.refresh} /> : !run ? <LoadingRows /> : <><div className="source-run-top"><div><strong>Localization {run.id.slice(0, 8)} {activeRunId === run.id ? '· Active' : '· Historical revision'}</strong><p className="field-help">{dateLabel(run.createdAt)} · {run.sourceLanguage === 'en' ? 'English' : 'Chinese'} → Mongolian · {run.mode}</p></div><StatusBadge status={run.status} /></div>
    <div className="localization-metrics">{[['Segments', run.segmentCount], ['Completed', run.completedSegmentCount], ['High confidence', run.highConfidenceCount], ['Needs review', run.reviewRecommendedCount], ['Likely problem', run.likelyProblemCount], ['Batches', `${run.completedBatchCount}/${run.batchCount}`]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <p className="field-help">{run.provider} · {run.model} · {run.promptVersion} · {run.pipelineVersion}. Confidence is a review signal, not guaranteed correctness.</p>
    {localizationActive(run) && <div className="run-progress"><progress max={100} value={run.progress} /><p className="field-help">{progressLabel(run)} · {run.progress}% stage progress</p></div>}
    {run.status === 'FAILED' && <div className="job-failure"><strong>{run.job.errorCode ?? 'LOCALIZATION_FAILED'}</strong><p>{run.job.errorMessage ?? 'Localization failed.'}</p></div>}
    {error && <ErrorNotice message={error} />}
    <div className="source-run-actions">{localizationActive(run) && <button className="button secondary" disabled={busy} onClick={() => void action('cancel')}>Cancel localization</button>}{run.status === 'FAILED' && <button className="button secondary" disabled={busy} onClick={() => void action('resume')}>Resume failed run</button>}{run.status === 'COMPLETED' && <button className="button primary" disabled={busy || activeRunId === run.id} onClick={() => void action('activate')}>{activeRunId === run.id ? 'Active localization' : 'Make localization active'}</button>}</div>
    {run.status === 'COMPLETED' && <LocalizationSegments key={run.id} run={run} />}</>}</article>;
}

export function LocalizationPanel({ episodeId }: { episodeId: string }) {
  const id = useId();
  const [mode, setMode] = useState<LocalizationMode>('NATURAL');
  const [fusionId, setFusionId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rerunKey = useRef<string | null>(null);
  const readiness = useResource('/localization/providers/readiness', localizationProviderReadinessSchema);
  const fusion = useResource(`/episodes/${episodeId}/fusion-runs?offset=0&limit=100`, fusionPageSchema);
  const runs = useResource(`/episodes/${episodeId}/localization-runs?offset=0&limit=100`, localizationPageSchema);
  useEffect(() => { if (fusion.data?.activeRunId && !fusionId) setFusionId(fusion.data.activeRunId); }, [fusion.data?.activeRunId, fusionId]);
  useEffect(() => { if (runs.data) setActiveRunId(runs.data.activeRunId); }, [runs.data]);
  const completedFusion = (fusion.data?.items ?? []).filter(run => run.status === 'COMPLETED');
  const activeFusion = fusion.data?.activeRunId;
  const selected = selectedLocalizationId(selectedId, activeRunId);
  async function create() {
    if (!fusionId) return;
    setBusy(true); setError(null); rerunKey.current ??= crypto.randomUUID();
    try { const run = await request(`/episodes/${episodeId}/localization-runs`, localizationRunSchema, { method: 'POST', body: { fusionRunId: fusionId, mode, settings: {}, rerunKey: rerunKey.current } }); rerunKey.current = null; setSelectedId(run.id); runs.refresh(); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  return <section className="source-panel localization-panel" aria-labelledby={`${id}-heading`}><div className="panel-heading"><h2 id={`${id}-heading`}>Mongolian localization</h2><span className="muted">Phase 04 · derived translation</span></div><div className="localization-create"><div className="provider-status"><strong>Localization provider</strong>{readiness.error ? <p>Unavailable · {readiness.error}</p> : <p>{readiness.data?.status ?? 'Checking'} · {readiness.data?.model || readiness.data?.message || 'Reading configuration'}</p>}</div><div className="localization-form-grid"><div className="field"><label htmlFor={`${id}-fusion`}>Canonical source transcript</label><select id={`${id}-fusion`} value={fusionId} onChange={event => setFusionId(event.target.value)}><option value="">Choose a completed FusionRun</option>{completedFusion.map((run: FusionRunDto) => <option key={run.id} value={run.id}>{run.id === activeFusion ? 'Active · ' : ''}{dateLabel(run.createdAt)} · {run.canonicalLanguage === 'en' ? 'English' : 'Chinese'} · {run.id.slice(0, 8)}</option>)}</select><p className="field-help">The explicitly active FusionRun is preselected. Choosing another completed run is an explicit override.</p></div><div className="field"><label htmlFor={`${id}-mode`}>Translation mode</label><select id={`${id}-mode`} value={mode} onChange={event => setMode(event.target.value as LocalizationMode)}><option value="STRICT">Strict</option><option value="NATURAL">Natural</option><option value="CINEMATIC">Cinematic</option></select><p className="field-help">{modeCopy[mode]}</p></div></div>{error && <ErrorNotice message={error} />}<button className="button primary" disabled={busy || !fusionId || readiness.data?.status !== 'READY'} onClick={() => void create()}>{busy ? 'Queuing…' : 'Generate Mongolian draft'}</button><p className="field-help">Each request creates or reuses a deterministic run revision. Source and canonical transcript records remain unchanged.</p></div><div className="source-results"><div className="source-results-toolbar"><h3>Localization history <span className="count">{runs.data?.total ?? '…'}</span></h3><button className="button secondary" onClick={runs.refresh}>Refresh history</button></div>{runs.error && <ErrorNotice message={runs.error} retry={runs.refresh} />}<div className="field"><label htmlFor={`${id}-run`}>Selected localization</label><select id={`${id}-run`} value={selected ?? ''} onChange={event => setSelectedId(event.target.value || null)}><option value="">Choose a run</option>{(runs.data?.items ?? []).map(run => <option key={run.id} value={run.id}>{run.id === activeRunId ? 'Active · ' : ''}{dateLabel(run.createdAt)} · {run.mode} · {run.status} · {run.id.slice(0, 8)}</option>)}</select><p className="field-help">Viewing a run never activates it. New runs preserve all earlier edits and approvals.</p></div>{selected ? <RunInspector key={selected} runId={selected} activeRunId={activeRunId} onChanged={runs.refresh} onActivated={setActiveRunId} /> : <p className="panel-empty">Generate or select a localization run to review source and Mongolian side by side.</p>}</div></section>;
}
