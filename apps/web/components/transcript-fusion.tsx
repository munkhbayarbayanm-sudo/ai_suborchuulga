'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { fusionPageSchema, fusionRunSchema, transcriptDetailSchema, transcriptPageSchema, type FusionRunDto, type MediaAssetDto, type SegmentMetadata, type TranscriptDetailDto } from '@mongolsub/contracts';
import { ApiError, errorText, request } from '../lib/api';
import { dateLabel } from '../lib/format';
import { sourceMethods, sourceTimestamp } from '../lib/extraction';
import { evidenceRoleLabel, fusionActive, humanReviewLabels, rerunFusion, reviewLabels, saveTranscript, selectedFusionId, type TranscriptDraft } from '../lib/fusion';
import { useResource } from '../lib/use-resource';
import { scheduleIdleRefresh } from '../lib/resource-polling';
import { FusionInputs } from './fusion-inputs';
import { ErrorNotice, LoadingRows, StatusBadge } from './ui';

function Confidence({ segment }: { segment: TranscriptDetailDto }) {
  return <div className="fusion-confidence"><span className={`review-category ${segment.reviewCategory.toLowerCase()}`}>{reviewLabels[segment.reviewCategory]} · {Math.round(segment.confidence * 100)}%</span><span className="human-review">Human: {humanReviewLabels[segment.reviewStatus]}</span>{segment.manualEditedAt && <span>Manually edited</span>}</div>;
}

function ProviderMetadata({ metadata }: { metadata: SegmentMetadata }) {
  return <details><summary>Original provider metadata</summary>{metadata.provider === 'ffmpeg' ? <p className="field-help">Codec: {metadata.codec ?? 'Unknown'} · Track language: {metadata.trackLanguage ?? 'Unknown'}</p> : metadata.provider === 'whisperx' ? <><p className="field-help">Model: {metadata.model}</p>{metadata.warnings.length ? <ul>{metadata.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : <p className="field-help">No provider warnings.</p>}</> : <><p className="field-help">Model: {metadata.model} · {metadata.observationCount} observations · Representative frame: {metadata.representativeTimestampMs} ms</p><p className="evidence-text">{metadata.rawText}</p><p className="field-help">Normalized box: {metadata.box?.map(value => value.toFixed(3)).join(', ') ?? 'Not provided'}</p></>}</details>;
}

function CanonicalEdit({ segment, onSaved }: { segment: TranscriptDetailDto; onSaved: (segment: TranscriptDetailDto) => void }) {
  const id = useId();
  const [draft, setDraft] = useState<TranscriptDraft>({ text: segment.text, startMs: String(segment.startMs), endMs: String(segment.endMs), reviewStatus: 'KEEP' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const changed = draft.text.trim() !== segment.text || draft.startMs !== String(segment.startMs) || draft.endMs !== String(segment.endMs) || draft.reviewStatus !== 'KEEP';
  async function save() {
    setBusy(true); setError(null); setConflict(false);
    try { onSaved(await saveTranscript(segment, draft)); }
    catch (error) { setConflict(error instanceof ApiError && error.status === 409); setError(errorText(error)); }
    finally { setBusy(false); }
  }
  async function reload() {
    setBusy(true);
    try { onSaved(await request(`/transcript-segments/${segment.id}`, transcriptDetailSchema)); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <form className="canonical-edit" onSubmit={event => { event.preventDefault(); void save(); }} aria-busy={busy}><h4>Canonical record</h4><div className="field"><label htmlFor={`${id}-text`}>Current text</label><textarea id={`${id}-text`} required maxLength={20000} disabled={busy} value={draft.text} onChange={event => setDraft(previous => ({ ...previous, text: event.target.value }))} /></div><div className="fusion-edit-grid">
    <div className="field"><label htmlFor={`${id}-start`}>Start (ms)</label><input id={`${id}-start`} type="number" min={0} max={2147483647} step={1} required disabled={busy} value={draft.startMs} onChange={event => setDraft(previous => ({ ...previous, startMs: event.target.value }))} /></div>
    <div className="field"><label htmlFor={`${id}-end`}>End (ms)</label><input id={`${id}-end`} type="number" min={1} max={2147483647} step={1} required disabled={busy} value={draft.endMs} onChange={event => setDraft(previous => ({ ...previous, endMs: event.target.value }))} /></div>
    <div className="field"><label htmlFor={`${id}-review`}>Human review action</label><select id={`${id}-review`} disabled={busy} value={draft.reviewStatus} onChange={event => setDraft(previous => ({ ...previous, reviewStatus: event.target.value === 'APPROVED' ? 'APPROVED' : event.target.value === 'REVIEWED' ? 'REVIEWED' : event.target.value === 'UNREVIEWED' ? 'UNREVIEWED' : 'KEEP' }))}><option value="KEEP">No review action</option><option value="UNREVIEWED">Mark unreviewed</option><option value="REVIEWED">Mark reviewed</option><option value="APPROVED">Approve explicitly</option></select></div>
  </div><p className="field-help">Text or timing edits reset human review to Unreviewed unless you explicitly choose a review action. Algorithm confidence and categories retain their completion snapshot.</p>{error && <ErrorNotice message={error} />}{conflict && <p className="field-help">A newer revision exists. Reload before editing again; reloading discards this unsaved draft.</p>}<div className="form-actions"><button className="button primary" disabled={busy || conflict || !changed}>{busy ? 'Saving…' : 'Save canonical record'}</button>{conflict && <button type="button" className="button secondary" disabled={busy} onClick={() => void reload()}>Reload latest record</button>}</div></form>;
}

function SegmentInspector({ segmentId, onChanged }: { segmentId: string; onChanged: () => void }) {
  const resource = useResource(`/transcript-segments/${segmentId}`, transcriptDetailSchema);
  const segment = resource.data;
  return <section className="fusion-segment-inspector" aria-label="Canonical segment and original evidence">{resource.error ? <ErrorNotice message={resource.error} retry={resource.refresh} /> : !segment ? <LoadingRows /> : <><div className="source-list-heading"><h3>Line {segment.sequence + 1}</h3><span className="muted">Revision {segment.editRevision} · {segment.language} · {segment.speaker ?? 'Speaker unknown'}</span></div><Confidence segment={segment} />
    <details className="fusion-reasons" open><summary>Why this confidence?</summary><ul>{segment.confidenceReasons.messages.map((message, index) => <li key={index}>{message}</li>)}</ul><p className="field-help">Agreeing methods: {segment.confidenceReasons.agreeingMethods.map(method => sourceMethods[method]).join(', ') || 'None'} · Conflicting sources: {segment.confidenceReasons.conflictingSources} · Timing spread: {segment.confidenceReasons.timingSpreadMs} ms</p><dl className="evidence-grid">{Object.entries(segment.confidenceReasons.scoreFactors).map(([label, value]) => <div key={label}><dt>{label.replace(/([A-Z])/g, ' $1').toLowerCase()}</dt><dd>{value.toFixed(3)}</dd></div>)}</dl></details>
    <div className="fusion-evidence-grid"><article className="fusion-evidence-card derived-evidence"><h4>Original algorithm derivation</h4><p className="evidence-text">{segment.derivedText}</p><p className="mono field-help">{sourceTimestamp(segment.derivedStartMs)} → {sourceTimestamp(segment.derivedEndMs)}</p><p className="field-help">Read only · retained after manual edits</p></article>{segment.evidence.map(evidence => <article className="fusion-evidence-card" key={evidence.sourceSegmentId}><h4>{sourceMethods[evidence.source.method]} <span className="count">#{evidence.source.sequence + 1}</span></h4><p className={`evidence-role ${evidence.role.toLowerCase()}`}>{evidenceRoleLabel(evidence.role)}</p><p className="evidence-text">{evidence.source.text}</p><p className="mono field-help">{sourceTimestamp(evidence.source.startMs)} → {sourceTimestamp(evidence.source.endMs)}</p><p className="field-help">{evidence.source.language ?? 'Language unknown'} · {evidence.source.streamIndex === null ? 'Video frames' : `Stream #${evidence.source.streamIndex}`} · Provider confidence: {evidence.source.confidence === null ? 'not provided' : evidence.source.confidence.toFixed(3)}</p><dl className="evidence-grid">
      <div><dt>Provider / version / model</dt><dd>{[evidence.provider, evidence.providerVersion, evidence.modelVersion].filter(Boolean).join(' · ')}</dd></div><div><dt>Alignment / IoU</dt><dd>{evidence.alignmentScore.toFixed(3)} / {evidence.temporalOverlap.toFixed(3)}</dd></div><div><dt>Text similarity</dt><dd>{evidence.textSimilarity === null ? 'Not compared' : evidence.textSimilarity.toFixed(3)}</dd></div><div><dt>Source run</dt><dd className="mono">{evidence.sourceExtractionRunId}</dd></div><div><dt>Source segment</dt><dd className="mono">{evidence.sourceSegmentId}</dd></div><div><dt>Text contribution</dt><dd>{evidence.contributionWeight === null ? 'No text vote' : evidence.contributionWeight.toFixed(3)}</dd></div>
    </dl><p className="field-help">Original speaker: {evidence.source.speaker ?? 'Not provided'}</p><ProviderMetadata metadata={evidence.source.providerMetadata} /><details><summary>Original words ({evidence.source.words.length})</summary>{evidence.source.words.length ? <ol className="fusion-words">{evidence.source.words.map((word, index) => <li key={index}><strong>{word.text}</strong><span className="mono">{word.startMs === null || word.endMs === null ? 'Timing unknown' : `${sourceTimestamp(word.startMs)} → ${sourceTimestamp(word.endMs)}`}</span><span>Confidence {word.confidence ?? 'unknown'} · {word.speaker ?? 'Speaker unknown'}</span></li>)}</ol> : <p className="field-help">No words were provided by this source.</p>}</details></article>)}</div>
    <CanonicalEdit key={`${segment.id}-${segment.editRevision}-${segment.updatedAt}`} segment={segment} onSaved={updated => { resource.setData(updated); onChanged(); }} />
  </>}</section>;
}

type Filter = 'ALL' | 'HIGH_CONFIDENCE' | 'REVIEW_RECOMMENDED' | 'LIKELY_PROBLEM' | 'MANUAL';
function TranscriptList({ run }: { run: FusionRunDto }) {
  const id = useId();
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const page = useResource(`/fusion-runs/${run.id}/segments?offset=${offset}&limit=25&filter=${filter}`, transcriptPageSchema);
  const current = page.data?.offset === offset && page.data.run.id === run.id ? page.data : null;
  return <div className="fusion-transcript"><div className="source-list-heading"><h3>Canonical lines <span className="count">{current?.total ?? '…'}</span></h3><div className="field"><label htmlFor={`${id}-filter`}>Review filter</label><select id={`${id}-filter`} value={filter} onChange={event => { const value = event.target.value; setFilter(value === 'HIGH_CONFIDENCE' || value === 'REVIEW_RECOMMENDED' || value === 'LIKELY_PROBLEM' || value === 'MANUAL' ? value : 'ALL'); setOffset(0); }}><option value="ALL">All lines</option><option value="HIGH_CONFIDENCE">High confidence</option><option value="REVIEW_RECOMMENDED">Review recommended</option><option value="LIKELY_PROBLEM">Likely problem</option><option value="MANUAL">Manually edited</option></select></div></div>
    {page.error ? <ErrorNotice message={page.error} retry={page.refresh} /> : page.loading ? <LoadingRows /> : current && <>{current.items.length ? <ol className="segment-list fusion-segment-list">{current.items.map(segment => <li key={segment.id}><button className={`segment-row ${selectedId === segment.id ? 'selected' : ''}`} aria-pressed={selectedId === segment.id} onClick={() => setSelectedId(segment.id)}><span className="mono segment-time">{sourceTimestamp(segment.startMs)} → {sourceTimestamp(segment.endMs)}</span><span className="segment-text">{segment.text}<Confidence segment={segment} /></span><span className="segment-number mono">#{segment.sequence + 1}</span></button></li>)}</ol> : <p className="panel-empty">No lines match this filter.</p>}{current.total > 25 && <div className="source-pagination"><button className="button secondary" disabled={offset === 0} onClick={() => setOffset(previous => Math.max(0, previous - 25))}>Previous lines</button><span className="muted">{offset + 1}–{Math.min(offset + 25, current.total)} of {current.total}</span><button className="button secondary" disabled={offset + 25 >= current.total} onClick={() => setOffset(previous => previous + 25)}>Next lines</button></div>}</>}
    {selectedId && <><p className="field-help">Selected line stays open when you browse pages or change filters.</p><SegmentInspector key={selectedId} segmentId={selectedId} onChanged={page.refresh} /></>}
  </div>;
}

function RunSummary({ run }: { run: FusionRunDto }) {
  const metrics = run.coverageMetrics;
  return <><p className="field-help">Canonical language: <strong>{run.canonicalLanguage === 'en' ? 'English' : 'Chinese'}</strong> · {run.requestedLanguage === 'AUTO' ? 'Auto resolved' : 'Explicit choice'} · {run.languageReason}</p>{metrics && <><div className="fusion-metrics">{[
    ['Canonical lines', metrics.canonicalSegmentCount], ['High confidence', metrics.highConfidenceCount], ['Review recommended', metrics.reviewRecommendedCount], ['Likely problem', metrics.likelyProblemCount], ['Single source', metrics.singleSourceSegments], ['Multi-source agreement', metrics.multiSourceAgreedSegments], ['Conflicting lines', metrics.conflictingSegments], ['Dialogue coverage', metrics.coverageRatio === null ? 'Duration unknown' : `${(metrics.coverageRatio * 100).toFixed(1)}%`], ['Covered duration', `${(metrics.coveredDialogueDurationMs / 1000).toFixed(2)} s`], ['Input segments', metrics.inputSegmentCount], ['Unrepresented timing-only', metrics.unrepresentedTimingOnlySegments], ['Overall heuristic', run.overallConfidence === null ? 'Not available' : `${(run.overallConfidence * 100).toFixed(1)}%`],
  ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><p className="field-help">Algorithm completion snapshot; manual edits and human approval do not recalculate these metrics. Heuristic confidence is not calibrated correctness.</p></>}
    <details className="fusion-run-details"><summary>Inputs, saved settings and processing durations</summary><ol className="fusion-input-history">{run.inputs.map(input => <li key={input.id}><strong>{sourceMethods[input.method]} · {input.languageDetected ?? input.languageRequested ?? 'Language unknown'}</strong><p className="field-help">{input.streamIndex === null ? 'Video frames' : `Stream #${input.streamIndex}`} · {input.segmentCount} segments · {[input.provider, input.providerVersion, input.modelVersion].filter(Boolean).join(' · ')}</p><p className="mono field-help">{input.id}</p></li>)}</ol><p className="field-help">Algorithm {run.algorithmVersion} · Revision {run.revision}</p><dl className="evidence-grid">{Object.entries(run.settings).flatMap(([group, values]) => Object.entries(values).map(([name, value]) => <div key={`${group}-${name}`}><dt>{group} · {name.replace(/([A-Z])/g, ' $1').replaceAll('_', ' ').toLowerCase()}</dt><dd>{String(value)}</dd></div>))}{[
      ['Alignment', run.alignmentDurationMs], ['Reconciliation', run.reconciliationDurationMs], ['Persistence', run.persistenceDurationMs], ['Total processing', run.processingDurationMs],
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value === null ? 'Not available' : `${value} ms`}</dd></div>)}</dl></details>
  </>;
}

function FusionRunInspector({ runId, activeId, onQueued, onActivated, onChanged }: { runId: string; activeId: string | null; onQueued: (run: FusionRunDto) => void; onActivated: (id: string) => void; onChanged: () => void }) {
  const resource = useResource(`/fusion-runs/${runId}`, fusionRunSchema);
  const run = resource.data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rerunKey = useRef<string | null>(null);
  useEffect(() => scheduleIdleRefresh(!!run && fusionActive(run), resource.loading, resource.refresh, 2000), [run?.status, resource.loading, resource.refresh]);
  useEffect(() => { if (run && !fusionActive(run)) onChanged(); }, [run?.status, onChanged]);
  async function action(kind: 'activate' | 'cancel' | 'rerun') {
    if (!run) return;
    setBusy(true); setError(null);
    try {
      if (kind === 'rerun') { rerunKey.current ??= crypto.randomUUID(); const next = await rerunFusion(run, rerunKey.current); rerunKey.current = null; onQueued(next); }
      else { const next = await request(`/fusion-runs/${run.id}/${kind}`, fusionRunSchema, { method: 'POST', body: {} }); resource.setData(next); if (kind === 'activate') onActivated(next.id); }
      onChanged();
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <article className="run-inspector fusion-run-inspector">{resource.error && <ErrorNotice message={resource.error} retry={resource.refresh} />}{!run ? <LoadingRows /> : <><div className="source-run-top"><div><strong>Transcript {run.id.slice(0, 8)}{activeId === run.id ? ' · Active transcript' : ' · Inactive revision'}</strong><p className="field-help">{dateLabel(run.createdAt)} · Media {run.mediaAssetId.slice(0, 8)}</p></div><StatusBadge status={run.status} /></div><RunSummary run={run} />
    <div className="source-run-actions">{fusionActive(run) ? <button className="button secondary" disabled={busy} onClick={() => void action('cancel')}>Cancel transcript run</button> : <button className="button secondary" disabled={busy} onClick={() => void action('rerun')}>Run again as new revision</button>}{run.status === 'COMPLETED' && <button className="button primary" disabled={busy || activeId === run.id} onClick={() => void action('activate')}>{activeId === run.id ? 'Active transcript' : 'Make this transcript active'}</button>}</div><p className="field-help">Reruns keep earlier manual work. Only making a completed run active changes the episode’s chosen transcript.</p>
    {fusionActive(run) && <div className="run-progress" role="status"><progress max={100} value={run.job.progress} aria-label="Transcript processing progress" /><p className="field-help">{(run.stage ?? 'Waiting for worker').replaceAll('_', ' ')} · {run.job.progress}% (stage progress)</p></div>}{run.status === 'FAILED' && <div className="job-failure" role="alert"><strong>{run.job.errorCode ?? 'FUSION_FAILED'}</strong><p>{run.job.errorMessage ?? 'Transcript processing failed.'}</p></div>}{run.status === 'CANCELLED' && <p className="field-help">Cancelled; this run has no valid canonical transcript.</p>}{error && <ErrorNotice message={error} />}{run.status === 'COMPLETED' && <TranscriptList key={run.id} run={run} />}
  </>}</article>;
}

export function TranscriptFusionPanel({ episodeId, asset, activeRunId, onActivated }: { episodeId: string; asset: MediaAssetDto; activeRunId: string | null; onActivated: (id: string) => void }) {
  const id = useId();
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [queuedSnapshot, setQueuedSnapshot] = useState<FusionRunDto | null>(null);
  const runs = useResource(`/episodes/${episodeId}/fusion-runs?offset=${offset}&limit=25`, fusionPageSchema);
  const activeId = activeRunId;
  const selected = selectedFusionId(selectedId, activeId);
  const page = runs.data?.offset === offset ? runs.data : null;
  const choices = page?.items ?? [];
  const outsidePage = selected !== null && !choices.some(run => run.id === selected);
  function queued(run: FusionRunDto) { setSelectedId(run.id); setQueuedSnapshot(run); runs.refresh(); }
  return <section className="source-panel fusion-panel" aria-labelledby={`${id}-heading`}><div className="panel-heading"><h2 id={`${id}-heading`}>Transcript reconciliation</h2><span className="muted">Phase 03 · source language only</span></div><FusionInputs key={asset.id} episodeId={episodeId} asset={asset} onQueued={queued} /><div className="source-results"><div className="source-results-toolbar"><h3>Transcript history <span className="count">{page?.total ?? '…'}</span></h3><button className="button secondary" onClick={runs.refresh} disabled={runs.loading}>Refresh history</button></div>{runs.error && <ErrorNotice message={runs.error} retry={runs.refresh} />}<div className="field"><label htmlFor={`${id}-run`}>Selected transcript</label><select id={`${id}-run`} value={selected ?? ''} onChange={event => setSelectedId(event.target.value || null)}><option value="">Choose a transcript run</option>{outsidePage && <option value={selected ?? ''}>{queuedSnapshot?.id === selected ? `Transcript ${selected?.slice(0, 8)} · ${queuedSnapshot.status}` : `Pinned transcript ${selected?.slice(0, 8)}`}{selected === activeId ? ' · Active' : ' · Outside this page'}</option>}{choices.map(run => <option key={run.id} value={run.id}>{dateLabel(run.createdAt)} · {run.canonicalLanguage} · {run.status} · {run.id.slice(0, 8)}{run.id === activeId ? ' · Active' : ''}</option>)}</select><p className="field-help">Active transcript: {activeId?.slice(0, 8) ?? 'None chosen'}. History includes all episode media. Viewing a revision never activates it.</p></div>{page && page.total > 25 && <div className="source-pagination"><button className="button secondary" disabled={runs.loading || offset === 0} onClick={() => setOffset(previous => Math.max(0, previous - 25))}>Previous runs</button><span className="muted">{offset + 1}–{Math.min(offset + 25, page.total)} of {page.total}</span><button className="button secondary" disabled={runs.loading || offset + 25 >= page.total} onClick={() => setOffset(previous => previous + 25)}>Next runs</button></div>}{selected ? <FusionRunInspector key={selected} runId={selected} activeId={activeId} onQueued={queued} onActivated={onActivated} onChanged={runs.refresh} /> : <p className="panel-empty">Build a transcript or select a saved revision to review its canonical lines and original alternatives.</p>}</div></section>;
}
