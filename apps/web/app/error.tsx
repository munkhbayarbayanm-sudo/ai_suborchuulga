'use client';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="standalone"><h1>The workspace could not open</h1><p className="muted">Try loading it again.</p><button className="button primary" onClick={reset}>Try again</button></main>;
}
