'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { extractionReadinessSchema, extractionRunSchema, runPageSchema, segmentPageSchema, type ExtractionRunDto, type MediaAssetDto, type ProviderReadiness, type SourceSegmentDto } from '@mongolsub/contracts';
import { errorText, request } from '../lib/api';
import { dateLabel } from '../lib/format';
import { embeddedLanguage, isTextSubtitle, queueAsr, queueEmbedded, queueOcr, rerunSource, runActive, selectedSourceRun, sourceGroup, sourceMethods, sourceTimestamp } from '../lib/extraction';
import { useResource } from '../lib/use-resource';
import { ErrorNotice, LoadingRows, StatusBadge } from './ui';

function ProviderStatus({ provider }: { provider: ProviderReadiness | undefined }) {
  return <div className="provider-status"><span className={`status-badge ${provider?.state === 'UNAVAILABLE' ? 'failed' : provider ? 'ready' : ''}`}><span className="status-dot" />{!provider ? 'Checking provider…' : provider.state === 'UNAVAILABLE' ? 'Unavailable' : provider.state === 'READY_GPU' ? 'Ready · GPU' : 'Ready · CPU'}</span>{provider && <p className="field-help">{[provider.provider, provider.version, provider.model].filter(Boolean).join(' · ')}</p>}{provider?.message && <p className="field-help">{provider.message}</p>}</div>;
}

function ExtractionForm({ title, provider, children }: { title: string; provider: ProviderReadiness | undefined; children: ReactNode }) {
  return <div className="extraction-method"><h3>{title}</h3><ProviderStatus provider={provider} />{children}</div>;
}

function SourceControls({ episodeId, asset, onQueued }: { episodeId: string; asset: MediaAssetDto; onQueued: (runs: ExtractionRunDto[]) => void }) {
  const id = useId();
  const readiness = useResource('/providers/readiness', extractionReadinessSchema);
  const [selectedTracks, setSelectedTracks] = useState<number[]>([]);
  const [audioStream, setAudioStream] = useState('');
  const [asrLanguage, setAsrLanguage] = useState<'en' | 'zh' | ''>('');
  const [align, setAlign] = useState(true);
  const [diarize, setDiarize] = useState(false);
  const [ocrLanguage, setOcrLanguage] = useState<'en' | 'zh-CN' | 'zh-TW'>('en');
  const [fps, setFps] = useState('4');
  const [region, setRegion] = useState<'BOTTOM_REGION' | 'FULL_FRAME'>('BOTTOM_REGION');
  const [bottomFraction, setBottomFraction] = useState('0.4');
  const [minimumConfidence, setMinimumConfidence] = useState('0.5');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [messages, setMessages] = useState<Record<string, string | null>>({});
  const subtitles = (asset.streams ?? []).filter(stream => stream.type === 'SUBTITLE');
  const audio = (asset.streams ?? []).filter(stream => stream.type === 'AUDIO');
  const ready = asset.status === 'READY';
  useEffect(() => { const timer = setInterval(readiness.refresh, 15000); return () => clearInterval(timer); }, [readiness.refresh]);
  function enabled(provider: ProviderReadiness | undefined) { return ready && !!provider && provider.state !== 'UNAVAILABLE'; }
  async function submit(method: string, tasks: (() => Promise<ExtractionRunDto>)[]) {
    setBusy(previous => ({ ...previous, [method]: true }));
    setErrors(previous => ({ ...previous, [method]: null }));
    setMessages(previous => ({ ...previous, [method]: null }));
    const results = await Promise.allSettled(tasks.map(task => Promise.resolve().then(task)));
    const runs: ExtractionRunDto[] = [];
    const failures: string[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') runs.push(result.value);
      else failures.push(errorText(result.reason));
    }
    if (runs.length) { onQueued(runs); setMessages(previous => ({ ...previous, [method]: `${runs.length === 1 ? 'Run' : `${runs.length} runs`} saved. Matching requests reuse existing runs.` })); }
    if (failures.length) setErrors(previous => ({ ...previous, [method]: failures.join(' ') }));
    setBusy(previous => ({ ...previous, [method]: false }));
  }
  function feedback(method: string) { return <>{errors[method] && <ErrorNotice message={errors[method]} />}{messages[method] && <p className="success-message" role="status">{messages[method]}</p>}</>; }
  return <>
    <div className="source-context"><span>Selected media</span><strong>{asset.originalFilename}</strong>{!ready && <p className="field-help">Extraction becomes available when this media finishes inspection.</p>}<p className="field-help">Each method creates independent source evidence. Readiness describes the environment; model quality is not evaluated.</p></div>
    {readiness.error && <ErrorNotice message={readiness.error} retry={readiness.refresh} />}
    <div className="extraction-forms">
      <ExtractionForm title="Embedded subtitles" provider={readiness.data?.embedded}><form onSubmit={event => { event.preventDefault(); void submit('embedded', selectedTracks.map(streamIndex => () => queueEmbedded(episodeId, { mediaAssetId: asset.id, streamIndex, language: embeddedLanguage(subtitles.find(stream => stream.streamIndex === streamIndex)?.language ?? null) }))); }} aria-busy={!!busy.embedded}>
        <fieldset disabled={!ready || !!busy.embedded}><legend>Select subtitle tracks</legend>{subtitles.length ? subtitles.map(stream => <label className="track-choice" key={stream.id}><input type="checkbox" checked={selectedTracks.includes(stream.streamIndex)} disabled={!isTextSubtitle(stream.codec)} onChange={event => setSelectedTracks(previous => event.target.checked ? [...previous, stream.streamIndex] : previous.filter(value => value !== stream.streamIndex))} /><span><strong>#{stream.streamIndex} · {stream.language || 'Language unknown'}</strong><small>{[stream.title, stream.codec || 'Codec unknown'].filter(Boolean).join(' · ')}</small>{!isTextSubtitle(stream.codec) && <small className="unsupported-reason">{stream.codec?.includes('pgs') || stream.codec?.includes('dvd') || stream.codec?.includes('dvb') ? 'Image subtitles cannot be extracted as text.' : 'This subtitle codec is unsupported for text extraction.'}</small>}</span></label>) : <p className="field-help">No embedded subtitle tracks detected.</p>}</fieldset>
        <button className="button primary" disabled={!enabled(readiness.data?.embedded) || !!busy.embedded || !selectedTracks.length}>{busy.embedded ? 'Saving runs…' : 'Extract selected text streams'}</button>{feedback('embedded')}
      </form></ExtractionForm>
      <ExtractionForm title="Speech recognition" provider={readiness.data?.asr}><form onSubmit={event => { event.preventDefault(); void submit('asr', [() => queueAsr(episodeId, { mediaAssetId: asset.id, streamIndex: Number(audioStream), language: asrLanguage || null, align, diarize })]); }} aria-busy={!!busy.asr}>
        <div className="field"><label htmlFor={`${id}-audio`}>Audio stream</label><select id={`${id}-audio`} value={audioStream} required disabled={!ready || !!busy.asr} onChange={event => setAudioStream(event.target.value)}><option value="">Choose an audio stream</option>{audio.map(stream => <option key={stream.id} value={stream.streamIndex}>#{stream.streamIndex} · {[stream.language || 'Unknown language', stream.title, stream.codec].filter(Boolean).join(' · ')}</option>)}</select>{!audio.length && <p className="field-help">No audio streams detected.</p>}</div>
        <div className="field"><label htmlFor={`${id}-asr-lang`}>Language hint</label><select id={`${id}-asr-lang`} value={asrLanguage} disabled={!ready || !!busy.asr} onChange={event => setAsrLanguage(event.target.value === 'en' ? 'en' : event.target.value === 'zh' ? 'zh' : '')}><option value="">Auto detect</option><option value="en">English</option><option value="zh">Chinese</option></select></div>
        <label className="check-field"><input type="checkbox" checked={align} disabled={!ready || !!busy.asr} onChange={event => setAlign(event.target.checked)} />Word alignment</label>
        <label className="check-field"><input type="checkbox" checked={diarize} disabled={!ready || !!busy.asr} onChange={event => setDiarize(event.target.checked)} />Speaker diarization (optional)</label><p className="field-help">Optional models may need downloads or access credentials. Unavailable alignment or diarization is recorded as a warning.</p>
        <button className="button primary" disabled={!enabled(readiness.data?.asr) || !!busy.asr || !audioStream}>{busy.asr ? 'Saving run…' : 'Transcribe selected audio'}</button>{feedback('asr')}
      </form></ExtractionForm>
      <ExtractionForm title="Burned-in subtitles" provider={readiness.data?.ocr}><form onSubmit={event => { event.preventDefault(); void submit('ocr', [() => queueOcr(episodeId, { mediaAssetId: asset.id, language: ocrLanguage, fps: Number(fps), region, bottomFraction: Number(bottomFraction), minimumConfidence: Number(minimumConfidence) })]); }} aria-busy={!!busy.ocr}>
        <div className="field"><label htmlFor={`${id}-ocr-lang`}>Text language</label><select id={`${id}-ocr-lang`} value={ocrLanguage} disabled={!ready || !!busy.ocr} onChange={event => setOcrLanguage(event.target.value === 'zh-CN' ? 'zh-CN' : event.target.value === 'zh-TW' ? 'zh-TW' : 'en')}><option value="en">English</option><option value="zh-CN">Simplified Chinese</option><option value="zh-TW">Traditional Chinese</option></select></div>
        <div className="field"><label htmlFor={`${id}-roi`}>Region</label><select id={`${id}-roi`} value={region} disabled={!ready || !!busy.ocr} onChange={event => setRegion(event.target.value === 'FULL_FRAME' ? 'FULL_FRAME' : 'BOTTOM_REGION')}><option value="BOTTOM_REGION">Bottom region</option><option value="FULL_FRAME">Full frame</option></select></div>
        <div className="source-numeric-grid"><div className="field"><label htmlFor={`${id}-fps`}>Samples / second</label><input id={`${id}-fps`} type="number" min={1} max={10} step={1} required value={fps} disabled={!ready || !!busy.ocr} onChange={event => setFps(event.target.value)} /></div>{region === 'BOTTOM_REGION' && <div className="field"><label htmlFor={`${id}-fraction`}>Bottom fraction</label><input id={`${id}-fraction`} type="number" min={0.2} max={0.6} step={0.05} required value={bottomFraction} disabled={!ready || !!busy.ocr} onChange={event => setBottomFraction(event.target.value)} /><p className="field-help">0.40 = lower 40%</p></div>}<div className="field"><label htmlFor={`${id}-confidence`}>Min. confidence</label><input id={`${id}-confidence`} type="number" min={0} max={1} step={0.05} required value={minimumConfidence} disabled={!ready || !!busy.ocr} onChange={event => setMinimumConfidence(event.target.value)} /></div></div>
        <button className="button primary" disabled={!enabled(readiness.data?.ocr) || !!busy.ocr || !(asset.streams ?? []).some(stream => stream.type === 'VIDEO')}>{busy.ocr ? 'Saving run…' : 'Extract on-screen text'}</button>{feedback('ocr')}
      </form></ExtractionForm>
    </div>
  </>;
}

function SegmentEvidence({ run, segment }: { run: ExtractionRunDto; segment: SourceSegmentDto }) {
  return <section className="source-evidence" aria-label="Selected segment evidence"><h3>Segment evidence <span className="count">#{segment.sequence + 1}</span></h3><dl className="evidence-grid">
    {[
      ['Run', run.id], ['Method', sourceMethods[run.method]], ['Media', run.mediaAssetId], ['Stream', segment.streamIndex === null ? 'Video frames' : `#${segment.streamIndex}`], ['Provider', run.provider], ['Provider version', run.providerVersion ?? 'Unknown'], ['Model', run.modelVersion ?? 'Not applicable / unknown'], ['Requested language', run.languageRequested ?? 'Auto / unknown'], ['Detected language', run.languageDetected ?? 'Unknown'], ['Segment language', segment.language ?? 'Unknown'], ['Confidence', segment.confidence === null ? 'Not provided' : String(segment.confidence)], ['Speaker', segment.speaker ?? 'Not provided'], ['Device', run.device ?? 'Unknown'], ['Duration', run.processingDurationMs === null ? 'Unknown' : `${run.processingDurationMs} ms`],
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl><details><summary>Word timing ({segment.words.length})</summary>{segment.words.length ? <div className="word-evidence"><table><thead><tr><th>Word</th><th>Start → end</th><th>Confidence</th><th>Speaker</th></tr></thead><tbody>{segment.words.map((word, index) => <tr key={index}><td>{word.text}</td><td className="mono">{word.startMs === null || word.endMs === null ? 'Not provided' : `${sourceTimestamp(word.startMs)} → ${sourceTimestamp(word.endMs)}`}</td><td>{word.confidence ?? '—'}</td><td>{word.speaker ?? '—'}</td></tr>)}</tbody></table></div> : <p className="field-help">This segment has no word timing evidence.</p>}</details><details><summary>Provider metadata</summary><pre>{JSON.stringify(segment.providerMetadata, null, 2)}</pre></details><details><summary>Run settings</summary><pre>{JSON.stringify(run.settings, null, 2)}</pre></details></section>;
}

function SourceSegments({ run }: { run: ExtractionRunDto }) {
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const page = useResource(`/source-extractions/${run.id}/segments?offset=${offset}&limit=50`, segmentPageSchema);
  useEffect(() => { if (run.status === 'COMPLETED') page.refresh(); }, [run.status, page.refresh]);
  const selected = page.data?.items.find(item => item.id === selectedId);
  return <div className="source-segments">{page.error ? <ErrorNotice message={page.error} retry={page.refresh} /> : page.loading && !page.data ? <LoadingRows /> : page.data && <>
    <div className="source-list-heading"><h3>Source segments <span className="count">{page.data.total}</span></h3><span className="muted">Read only · select a line to inspect evidence</span></div>
    {page.data.items.length ? <ol className="segment-list">{page.data.items.map(segment => <li key={segment.id}><button className={`segment-row ${selectedId === segment.id ? 'selected' : ''}`} aria-pressed={selectedId === segment.id} onClick={() => setSelectedId(segment.id)}><span className="mono segment-time">{sourceTimestamp(segment.startMs)}<span> → </span>{sourceTimestamp(segment.endMs)}</span><span className="segment-text">{segment.text}</span><span className="segment-number mono">#{segment.sequence + 1}</span></button></li>)}</ol> : <p className="panel-empty">{run.status === 'COMPLETED' ? 'This run completed with no source segments.' : runActive(run) ? 'Segments appear after this run completes.' : 'No source segments were produced.'}</p>}
    {page.data.total > 50 && <div className="source-pagination"><button className="button secondary" disabled={page.loading || offset === 0} onClick={() => { setOffset(previous => Math.max(0, previous - 50)); setSelectedId(null); }}>Previous lines</button><span className="muted">{offset + 1}–{Math.min(offset + 50, page.data.total)} of {page.data.total}</span><button className="button secondary" disabled={page.loading || offset + 50 >= page.data.total} onClick={() => { setOffset(previous => previous + 50); setSelectedId(null); }}>Next lines</button></div>}
    {selected && <SegmentEvidence run={page.data.run} segment={selected} />}
  </>}</div>;
}

function RunInspector({ initial, onChanged, onRerun }: { initial: ExtractionRunDto; onChanged: () => void; onRerun: (runs: ExtractionRunDto[]) => void }) {
  const resource = useResource(`/source-extractions/${initial.id}`, extractionRunSchema);
  const run = resource.data ?? initial;
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const rerunKey = useRef<string | null>(null);
  useEffect(() => {
    if (!runActive(run)) return;
    const timer = setInterval(resource.refresh, 2000);
    return () => clearInterval(timer);
  }, [run.status, resource.refresh]);
  useEffect(() => { if (!runActive(run)) onChanged(); }, [run.status, onChanged]);
  async function action(kind: 'cancel' | 'rerun') {
    setBusy(true); setActionError(null);
    try {
      if (kind === 'cancel') {
        const updated = await request(`/source-extractions/${run.id}/cancel`, extractionRunSchema, { method: 'POST', body: {} });
        resource.setData(updated);
      } else {
        rerunKey.current ??= crypto.randomUUID();
        const next = await rerunSource(run, rerunKey.current);
        rerunKey.current = null;
        onRerun([next]);
      }
      onChanged();
    } catch (error) { setActionError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <article className="run-inspector"><div className="source-run-top"><div><strong>{sourceGroup(run)}</strong><p className="field-help">Run {run.id.slice(0, 8)} · {dateLabel(run.createdAt)} · Media {run.mediaAssetId.slice(0, 8)}{run.streamIndex === null ? '' : ` · Stream #${run.streamIndex}`}</p></div><StatusBadge status={run.status} /></div>
    <div className="source-run-actions">{runActive(run) ? <button className="button secondary" disabled={busy} onClick={() => void action('cancel')}>{busy ? 'Cancelling…' : 'Cancel run'}</button> : <button className="button secondary" disabled={busy} onClick={() => void action('rerun')}>{busy ? 'Saving new run…' : 'Run again as new revision'}</button>}<span className="field-help">{run.revision === '0' ? 'Original run' : `Revision ${run.revision.slice(0, 8)}`} · {run.segmentCount} segments</span></div>
    {runActive(run) && <div className="run-progress" role="status"><progress max={100} value={run.job.progress} aria-label={`${sourceMethods[run.method]} progress`} /><p className="field-help">{(run.stage || (run.status === 'QUEUED' ? 'Waiting for worker' : 'Processing')).replaceAll('_', ' ')} · {run.job.progress}% (stage progress)</p></div>}
    {run.status === 'FAILED' && <div className="job-failure" role="alert"><strong>{run.job.errorCode || 'EXTRACTION_FAILED'}</strong><p>{run.job.errorMessage || 'Source extraction failed. Inspect provider readiness and settings, then create a new run.'}</p></div>}
    {run.status === 'CANCELLED' && <p className="field-help">This run was cancelled. You can create a new revision.</p>}
    {resource.error && <ErrorNotice message={resource.error} retry={resource.refresh} />}{actionError && <ErrorNotice message={actionError} />}
    <SourceSegments run={run} />
  </article>;
}

export function SourceExtractionPanel({ episodeId, asset }: { episodeId: string; asset: MediaAssetDto }) {
  const [offset, setOffset] = useState(0);
  const [selectedRun, setSelectedRun] = useState<ExtractionRunDto | null>(null);
  const runs = useResource(`/episodes/${episodeId}/source-extractions?offset=${offset}&limit=25`, runPageSchema);
  const selected = selectedSourceRun(runs.data?.items ?? [], selectedRun);
  const selectedOutsidePage = !!selected && !runs.data?.items.some(run => run.id === selected.id);
  const availableRuns = selectedOutsidePage ? [selected, ...(runs.data?.items ?? [])] : runs.data?.items ?? [];
  const groups = new Map<string, ExtractionRunDto[]>();
  for (const run of availableRuns) { const group = sourceGroup(run); groups.set(group, [...(groups.get(group) ?? []), run]); }
  const hasActive = runs.data?.items.some(runActive) ?? false;
  useEffect(() => { if (!hasActive) return; const timer = setInterval(runs.refresh, 4000); return () => clearInterval(timer); }, [hasActive, runs.refresh]);
  function onQueued(queued: ExtractionRunDto[]) {
    setOffset(0); setSelectedRun(queued[0] ?? null);
    if (offset === 0) runs.setData(previous => previous ? { ...previous, items: [...queued, ...previous.items.filter(run => !queued.some(item => item.id === run.id))].slice(0, 25) } : null);
    runs.refresh();
  }
  return <section className="source-panel" aria-labelledby="source-extraction-heading"><div className="panel-heading"><h2 id="source-extraction-heading">Source extraction</h2><span className="muted">Independent evidence</span></div><SourceControls key={asset.id} episodeId={episodeId} asset={asset} onQueued={onQueued} />
    <div className="source-results"><div className="source-results-toolbar"><h3>Episode source runs <span className="count">{runs.data?.total ?? 0}</span></h3><button className="button secondary" onClick={runs.refresh} disabled={runs.loading}>Refresh runs</button></div>
      {runs.error ? <ErrorNotice message={runs.error} retry={runs.refresh} /> : runs.loading && !runs.data ? <LoadingRows /> : runs.data && <>{availableRuns.length ? <><div className="field"><label htmlFor={`source-run-${episodeId}`}>Choose an independent source result</label><select id={`source-run-${episodeId}`} value={selected?.id ?? ''} onChange={event => setSelectedRun(availableRuns.find(run => run.id === event.target.value) ?? null)}>{Array.from(groups, ([group, items]) => <optgroup label={group} key={group}>{items.map(run => <option key={run.id} value={run.id}>{run.id.slice(0, 8)} · {run.status.toLowerCase()} · media {run.mediaAssetId.slice(0, 8)}{run.streamIndex === null ? '' : ` · #${run.streamIndex}`} · {run.segmentCount} lines</option>)}</optgroup>)}</select>{selectedOutsidePage && <p className="field-help">The selected result is outside this history page. Its exact run remains open below.</p>}</div>{selected && <RunInspector key={selected.id} initial={selected} onChanged={runs.refresh} onRerun={onQueued} />}</> : <p className="panel-empty">No extraction runs yet. Choose a source method above.</p>}
      {runs.data.total > 25 && <div className="source-pagination"><button className="button secondary" disabled={runs.loading || offset === 0} onClick={() => { setSelectedRun(selected ?? null); setOffset(previous => Math.max(0, previous - 25)); }}>Previous runs</button><span className="muted">{offset + 1}–{Math.min(offset + 25, runs.data.total)} of {runs.data.total}</span><button className="button secondary" disabled={runs.loading || offset + 25 >= runs.data.total} onClick={() => { setSelectedRun(selected ?? null); setOffset(previous => previous + 25); }}>Next runs</button></div>}</>}
    </div>
  </section>;
}
