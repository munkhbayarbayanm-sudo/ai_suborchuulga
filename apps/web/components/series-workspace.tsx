'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { seriesDetailSchema } from '@mongolsub/contracts';
import { useResource } from '../lib/use-resource';
import { dateLabel, languageLabel } from '../lib/format';
import { SeriesForm, EpisodeForm } from './forms';
import { Shell, PageHeading, ErrorNotice, LoadingRows, EmptyState, Icon } from './ui';
import { SeriesLocalizationMemory } from './series-localization-memory';

export function SeriesWorkspace({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, loading, refresh, setData } = useResource(`/series/${encodeURIComponent(id)}`, seriesDetailSchema);
  const [form, setForm] = useState<'series' | 'episode' | null>(null);
  const [saved, setSaved] = useState(false);
  return <Shell context="Series"><div className="page-content"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Library</Link><span aria-hidden="true">/</span><span>Series</span></nav>
    {error ? <ErrorNotice message={error} retry={refresh} /> : loading && !data ? <LoadingRows /> : data && <><PageHeading title={data.title} description={data.description || undefined}><button className="button secondary" disabled={!!form} onClick={() => { setForm('series'); setSaved(false); }}>Edit series</button><button className="button primary" disabled={!!form} onClick={() => setForm('episode')}><Icon name="plus" />New episode</button></PageHeading>
    <div className="series-context"><span><span className="muted">Source</span> {languageLabel(data.sourceLanguage)}</span><span><span className="muted">Target</span> Mongolian Cyrillic</span><span><span className="muted">Updated</span> {dateLabel(data.updatedAt)}</span></div>
    {saved && <p className="success-message" role="status"><Icon name="check" size={16} />Series saved</p>}
    {form === 'series' && <SeriesForm series={data} onSaved={series => { setData({ ...series, episodes: data.episodes }); setForm(null); setSaved(true); }} onCancel={() => setForm(null)} />}
    {form === 'episode' && <EpisodeForm seriesId={id} onSaved={episode => router.push(`/episodes/${episode.id}`)} onCancel={() => setForm(null)} />}
    <section aria-labelledby="episodes-heading" className="library-section"><div className="section-toolbar"><h2 id="episodes-heading">Episodes <span className="count">{data.episodes.length}</span></h2><span className="muted">Open an episode to import video</span></div>{data.episodes.length === 0 ? <EmptyState title="Add the first episode" description="Each episode has its own media, inspection jobs, and source tracks."><button className="button secondary" disabled={!!form} onClick={() => setForm('episode')}><Icon name="plus" />Create episode</button></EmptyState> : <div className="index-list">{data.episodes.map(episode => <Link key={episode.id} href={`/episodes/${episode.id}`} className="index-row episode-row"><span className="episode-number">{episode.episodeNumber === null ? '—' : String(episode.episodeNumber).padStart(2, '0')}</span><span className="row-main"><strong>{episode.title}</strong><span>Episode workspace</span></span><span className="row-date">{dateLabel(episode.updatedAt)}</span><Icon name="arrow" /></Link>)}</div>}</section><SeriesLocalizationMemory seriesId={id} episodes={data.episodes.map(episode => ({ id: episode.id, title: episode.title }))} />
    </>}
  </div></Shell>;
}
