'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { episodeDetailSchema, jobSchema, mediaDetailSchema, type JobDto, type MediaAssetDto } from '@mongolsub/contracts';
import { errorText, request, uploadMedia } from '../lib/api';
import { bytesLabel, dateLabel, durationLabel } from '../lib/format';
import { useResource } from '../lib/use-resource';
import { EpisodeForm } from './forms';
import { SourceExtractionPanel } from './source-extraction';
import { TranscriptFusionPanel } from './transcript-fusion';
import { Shell, PageHeading, ErrorNotice, LoadingRows, Icon, StatusBadge, ReservedPanel } from './ui';

function isActive(job: JobDto) { return job.status === 'QUEUED' || job.status === 'PROCESSING'; }

function ImportForm({ episodeId, onImported }: { episodeId: string; onImported: (asset: MediaAssetDto) => void }) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setSuccess(false);
    if (!file) { setError('Choose a source video before importing.'); return; }
    if (file.size === 0) { setError('This file is empty. Choose a video with content.'); return; }
    controller.current = new AbortController();
    setBusy(true); setProgress(0); setError(null);
    try {
      const result = await uploadMedia(episodeId, file, setProgress, controller.current.signal);
      onImported(result.asset); setFile(null); setSuccess(true);
      if (input.current) input.current.value = '';
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setError(errorText(error));
    } finally {
      if (!controller.current?.signal.aborted) setBusy(false);
    }
  }
  return <section className="import-panel" aria-labelledby="import-heading"><div className="panel-heading"><h2 id="import-heading"><Icon name="upload" />Import source video</h2><span className="muted">Original preserved</span></div><form onSubmit={submit} aria-busy={busy}>
    <label htmlFor={`${id}-file`} className="file-label">Source video file</label><input ref={input} id={`${id}-file`} className="file-input" type="file" accept="video/*,.mkv,.mp4,.mov,.avi,.webm,.m4v,.ts,.m2ts" disabled={busy} aria-describedby={`${id}-help`} aria-invalid={!!error} onChange={event => { setFile(event.target.files?.[0] || null); setError(null); setSuccess(false); }} />
    <div className="import-actions"><p className="field-help" id={`${id}-help`}>{file ? `${file.name} · ${bytesLabel(file.size)}` : 'Choose one video. Metadata and source tracks are inspected after upload.'}</p><button className="button primary" type="submit" disabled={busy}><Icon name="upload" />{busy ? progress === 100 ? 'Finishing upload…' : 'Uploading…' : 'Import video'}</button></div>
    {busy && <div className="upload-progress" role="status" aria-live="polite"><div><span>{progress === 100 ? 'Saving media and queuing inspection' : 'Uploading source video'}</span><span>{progress}%</span></div><progress max={100} value={progress} aria-label="Video upload progress" /></div>}
    {error && <ErrorNotice message={error} />}{success && <p className="success-message" role="status"><Icon name="check" size={16} />Video imported. Follow its inspection status below.</p>}
  </form></section>;
}

function JobMonitor({ initial, onTerminal }: { initial: JobDto; onTerminal: () => void }) {
  const [job, setJob] = useState(initial);
  const [pollError, setPollError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  useEffect(() => {
    setJob(initial);
    if (!isActive(initial)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await request(`/jobs/${initial.id}`, jobSchema, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setJob(next); setPollError(null);
        if (!isActive(next)) { onTerminal(); return; }
      } catch (error) { if (!controller.signal.aborted) setPollError(errorText(error)); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
    }
    timer = setTimeout(poll, 1000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [initial, onTerminal, retryVersion]);
  return <article className="job-row"><div className="job-top"><strong>Media inspection</strong><StatusBadge status={job.status} /></div><p className="job-id">Job {job.id.slice(0, 8)} · {job.mediaAssetId ? `Media ${job.mediaAssetId.slice(0, 8)}` : 'Media unavailable'}</p>
    {isActive(job) && <><progress max={100} value={job.progress} aria-label="Media inspection progress" /><p className="field-help">{job.status === 'QUEUED' ? 'Waiting for the inspection worker' : 'Reading container metadata and source tracks'} · {job.progress}%</p></>}
    {job.status === 'COMPLETED' && <p className="field-help">Metadata and streams saved{job.completedAt ? ` · ${dateLabel(job.completedAt)}` : ''}</p>}
    {job.status === 'CANCELLED' && <p className="field-help">Inspection was cancelled.</p>}
    {job.status === 'FAILED' && <div className="job-failure" role="alert"><strong>{job.errorCode || 'INSPECTION_FAILED'}</strong><p>{job.errorMessage || 'The media could not be inspected. Import a valid source video to try again.'}</p></div>}
    {pollError && <div className="poll-error" role="alert"><p>{pollError}</p><span>Polling will retry automatically.</span><button className="button secondary" onClick={() => setRetryVersion(value => value + 1)}>Retry now</button></div>}
  </article>;
}

function MediaInspector({ assetId, revision }: { assetId: string; revision: number }) {
  const { data, error, loading, refresh } = useResource(`/media/${assetId}`, mediaDetailSchema);
  useEffect(() => { if (revision > 0) refresh(); }, [revision, refresh]);
  return <section className="inspector-panel" aria-labelledby="metadata-heading"><div className="panel-heading"><h2 id="metadata-heading">Media information</h2>{data && <StatusBadge status={data.status} />}</div>
    {error ? <ErrorNotice message={error} retry={refresh} /> : loading && !data ? <LoadingRows /> : data && <><p className="asset-filename">{data.originalFilename}</p><dl className="metadata-grid">
      <div><dt>Duration</dt><dd className="mono">{durationLabel(data.durationMs)}</dd></div><div><dt>Resolution</dt><dd className="mono">{data.width && data.height ? `${data.width} × ${data.height}` : '—'}</dd></div><div><dt>Container</dt><dd>{data.containerFormat || '—'}</dd></div><div><dt>Size</dt><dd>{bytesLabel(data.sizeBytes)}</dd></div><div><dt>Media type</dt><dd>{data.mimeType}</dd></div><div><dt>Imported</dt><dd>{dateLabel(data.createdAt)}</dd></div>
      </dl><div className="stream-section"><h3>Source tracks <span className="count">{data.streams.length}</span></h3>{data.streams.length ? <ol className="stream-list">{data.streams.map(stream => <li key={stream.id}><div className="stream-top"><span className="stream-index mono">{String(stream.streamIndex).padStart(2, '0')}</span><strong>{stream.type.toLowerCase()}</strong><span className="mono">{stream.codec || 'Unknown codec'}</span></div><p>{[stream.language || 'Language unknown', stream.title, stream.width && stream.height ? `${stream.width} × ${stream.height}` : null, stream.frameRate ? `${Number(stream.frameRate.toFixed(3))} fps` : null, stream.channels ? `${stream.channels} ${stream.channels === 1 ? 'channel' : 'channels'}` : null, stream.sampleRate ? `${stream.sampleRate} Hz` : null].filter(Boolean).join(' · ')}</p></li>)}</ol> : <p className="muted">{data.status === 'READY' ? 'No source tracks detected.' : data.status === 'FAILED' ? 'Tracks are unavailable because inspection failed.' : 'Tracks will appear after inspection.'}</p>}</div>
      </>}
  </section>;
}

export function EpisodeWorkspace({ id }: { id: string }) {
  const { data, error, loading, refresh, setData } = useResource(`/episodes/${encodeURIComponent(id)}`, episodeDetailSchema);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const selected = data?.mediaAssets.find(asset => asset.id === selectedId) || data?.mediaAssets[0];
  const inspectionJobs = data?.jobs.filter(job => job.jobType === 'INSPECT_MEDIA') ?? [];
  const handleTerminal = useCallback(() => { refresh(); setRevision(value => value + 1); }, [refresh]);
  return <Shell context="Episode"><div className="page-content episode-content"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Library</Link><span aria-hidden="true">/</span>{data && <><Link href={`/series/${data.seriesId}`}>Series</Link><span aria-hidden="true">/</span></>}<span>Episode</span></nav>
    {error ? <ErrorNotice message={error} retry={refresh} /> : loading && !data ? <LoadingRows /> : data && <><PageHeading title={data.title} description={data.episodeNumber === null ? 'Episode workspace' : `Episode ${String(data.episodeNumber).padStart(2, '0')}`}><button className="button secondary" onClick={() => { setEditing(true); setSaved(false); }} disabled={editing}>Edit episode</button><Link className="button secondary" href={`/series/${data.seriesId}`}>All episodes</Link></PageHeading>
    {saved && <p className="success-message" role="status"><Icon name="check" size={16} />Episode saved</p>}
    {editing && <EpisodeForm seriesId={data.seriesId} episode={data} onSaved={episode => { setData({ ...episode, jobs: data.jobs, mediaAssets: data.mediaAssets }); setEditing(false); setSaved(true); }} onCancel={() => setEditing(false)} />}
    <div className="editor-grid"><div className="media-column"><ImportForm episodeId={id} onImported={asset => { setSelectedId(asset.id); setData(previous => previous ? { ...previous, mediaAssets: [asset, ...previous.mediaAssets] } : previous); refresh(); }} />
      <ReservedPanel title="Video preview" detail="Video playback will be added with the editor." />
      <section className="assets-panel"><div className="panel-heading"><h2>Imported media <span className="count">{data.mediaAssets.length}</span></h2></div>{data.mediaAssets.length ? <div className="asset-list">{data.mediaAssets.map(asset => <button key={asset.id} className={`asset-row ${asset.id === selected?.id ? 'selected' : ''}`} aria-pressed={asset.id === selected?.id} onClick={() => setSelectedId(asset.id)}><Icon name="film" /><span><strong>{asset.originalFilename}</strong><small>{bytesLabel(asset.sizeBytes)} · {dateLabel(asset.createdAt)}</small></span><StatusBadge status={asset.status} /></button>)}</div> : <p className="panel-empty">No source video yet. Import a file above to inspect its metadata.</p>}</section>
    </div><aside className="inspector-column" aria-label="Media and job inspector">{selected ? <MediaInspector key={selected.id} assetId={selected.id} revision={revision} /> : <section className="inspector-panel"><div className="panel-heading"><h2>Media information</h2></div><p className="panel-empty">Duration, resolution, and source tracks will appear here after import.</p></section>}
      <section className="jobs-panel"><div className="panel-heading"><h2>Inspection jobs <span className="count">{inspectionJobs.length}</span></h2><span className="live-label">{inspectionJobs.some(isActive) ? 'Live' : 'History'}</span></div>{inspectionJobs.length ? inspectionJobs.map(job => <JobMonitor key={job.id} initial={job} onTerminal={handleTerminal} />) : <p className="panel-empty">Importing a video creates a background inspection job.</p>}</section>
    </aside>{selected && <><SourceExtractionPanel episodeId={id} asset={selected} /><TranscriptFusionPanel episodeId={id} asset={selected} activeRunId={data.activeFusionRunId} onActivated={activeFusionRunId => { setData(previous => previous ? { ...previous, activeFusionRunId } : previous); refresh(); }} /></>}<div className="editor-reserve"><ReservedPanel title="Timeline & subtitle editor" detail="Editing tools and subtitle tracks are reserved for a later phase." /><div className="reserved-toolbar" aria-label="Unavailable editor actions"><button className="button secondary" disabled><Icon name="lock" size={14} />Subtitle editing</button><button className="button secondary" disabled><Icon name="lock" size={14} />Video editing</button><button className="button secondary" disabled><Icon name="lock" size={14} />Export</button></div></div></div>
    </>}
  </div></Shell>;
}
