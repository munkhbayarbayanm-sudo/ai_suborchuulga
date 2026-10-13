'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { seriesSchema } from '@mongolsub/contracts';
import { useResource } from '../lib/use-resource';
import { dateLabel, languageLabel } from '../lib/format';
import { SeriesForm } from './forms';
import { Shell, PageHeading, ErrorNotice, LoadingRows, EmptyState, Icon } from './ui';

const listSchema = seriesSchema.array();

export function Library() {
  const router = useRouter();
  const { data, error, loading, refresh } = useResource('/series', listSchema);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = data?.filter(series => series.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <Shell><div className="page-content"><PageHeading title="Series library" description="Organize your series and import episode media."><button className="button primary" onClick={() => setCreating(true)} disabled={creating}><Icon name="plus" />New series</button></PageHeading>
    {creating && <SeriesForm onSaved={series => router.push(`/series/${series.id}`)} onCancel={() => setCreating(false)} />}
    <section className="library-section" aria-labelledby="library-heading"><div className="section-toolbar"><h2 id="library-heading">Your series {data && <span className="count">{data.length}</span>}</h2><div className="search-field"><label className="sr-only" htmlFor="series-search">Filter series by title</label><input type="search" id="series-search" placeholder="Filter by title" value={query} onChange={event => setQuery(event.target.value)} /></div></div>
    {error ? <ErrorNotice message={error} retry={refresh} /> : loading && !data ? <LoadingRows /> : data?.length === 0 ? <EmptyState title="Your library starts here" description="Create a series, add an episode, and import its source video."><button className="button secondary" onClick={() => setCreating(true)} disabled={creating}><Icon name="plus" />Create series</button></EmptyState> : filtered?.length === 0 ? <EmptyState title="No matching series" description="Try a different title or clear the filter."><button className="button secondary" onClick={() => setQuery('')}>Clear filter</button></EmptyState> : <div className="index-list">{filtered?.map(series => <Link key={series.id} href={`/series/${series.id}`} className="index-row"><span className="row-symbol"><Icon name="library" size={23} /></span><span className="row-main"><strong>{series.title}</strong><span>{series.description || 'No description'}</span></span><span className="row-language">{languageLabel(series.sourceLanguage)}</span><span className="row-date">{dateLabel(series.updatedAt)}</span><Icon name="arrow" /></Link>)}</div>}
    </section><div className="library-footnote"><span>Source media stays unchanged.</span><span>Translation and editing are reserved for later phases.</span></div>
  </div></Shell>;
}
