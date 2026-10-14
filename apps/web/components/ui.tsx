'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { healthSchema } from '@mongolsub/contracts';
import { useResource } from '../lib/use-resource';

export function Icon({ name, size = 18 }: { name: 'library' | 'plus' | 'arrow' | 'film' | 'upload' | 'lock' | 'check'; size?: number }) {
  const paths = {
    library: <><path d="M4 5h4v14H4zM10 5h4v14h-4zM16 5l4-1 3 14-4 1z" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    film: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M8 3v18M16 3v18M4 8h4m-4 8h4m8-8h4m-4 8h4" /></>,
    upload: <path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" />,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function ServiceStatus() {
  const { data, error, refresh } = useResource('/health', healthSchema);
  useEffect(() => { const interval = setInterval(refresh, 15000); return () => clearInterval(interval); }, [refresh]);
  const [expanded, setExpanded] = useState(false);
  const label = error ? 'API unavailable' : data?.status === 'ok' ? 'Services ready' : data ? 'Services degraded' : 'Checking services';
  return <div className="service-status">
    <button className="service-toggle" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-controls="service-details"><span className={`status-dot ${data?.status === 'ok' ? 'ready' : 'warning'}`} />{label}<span className="service-caret">{expanded ? '−' : '+'}</span></button>
    {expanded && <div className="service-details" id="service-details">{error ? <p>{error}</p> : data ? <dl>{[
      ['Database', data.database], ['Queue', data.redis], ['FFprobe', data.tools.ffprobe], ['FFmpeg', data.tools.ffmpeg], ['Worker', data.worker.ready],
    ].map(([label, ready]) => <div key={String(label)}><dt>{label}</dt><dd>{ready ? 'Ready' : 'Unavailable'}</dd></div>)}</dl> : <p>Waiting for the API…</p>}</div>}
  </div>;
}

export function Shell({ children, context = 'Library' }: { children: ReactNode; context?: string }) {
  return <div className="studio-shell">
    <a className="skip-link" href="#workspace">Skip to workspace</a>
    <aside className="rail" aria-label="Studio navigation">
      <Link className="brand" href="/" aria-label="MongolSub Studio library"><span className="brand-mark">M<span>·</span></span><span className="brand-name">MongolSub<small>Studio</small></span></Link>
      <nav><Link href="/" className="nav-item current"><Icon name="library" />Series library</Link></nav>
      <div className="rail-note"><span className="phase-label">Localization studio</span><p>Preserve evidence.<br />Review Mongolian.</p></div>
      <ServiceStatus />
    </aside>
    <div className="workspace-shell"><header className="topbar"><span className="context-label">{context}</span><span className="topbar-note">Mongolian localization workspace</span></header><main id="workspace" tabIndex={-1}>{children}</main></div>
  </div>;
}

export function PageHeading({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1>{description && <p className="muted">{description}</p>}</div>{children && <div className="heading-actions">{children}</div>}</div>;
}

export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-notice" role="alert"><div><strong>Could not complete the request</strong><p>{message}</p></div>{retry && <button className="button secondary" onClick={retry}>Try again</button>}</div>;
}

export function LoadingRows() { return <div className="loading-rows" role="status" aria-label="Loading workspace"><div /><div /><div /><span className="sr-only">Loading workspace…</span></div>; }

export function EmptyState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="empty-state"><Icon name="film" size={28} /><h2>{title}</h2><p className="muted">{description}</p>{children}</div>;
}

const statusLabels: Record<string, string> = { QUEUED: 'Queued', PROCESSING: 'Processing', COMPLETED: 'Completed', FAILED: 'Failed', CANCELLED: 'Cancelled', IMPORTED: 'Imported', INSPECTING: 'Inspecting', READY: 'Ready' };
export function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge ${status.toLowerCase()}`}><span className="status-dot" />{statusLabels[status] || status}</span>;
}

export function ReservedPanel({ title, detail }: { title: string; detail: string }) {
  return <section className="reserved-panel" aria-label={`${title}, unavailable`}><div className="panel-heading"><h2>{title}</h2><span className="reserved-label"><Icon name="lock" size={13} />Reserved</span></div><div className="reserved-content"><Icon name="lock" size={22} /><p>{detail}</p><span>Not available in this phase</span></div></section>;
}
