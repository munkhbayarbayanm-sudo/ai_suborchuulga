import Link from 'next/link';

export default function NotFound() {
  return <main className="standalone"><h1>Workspace not found</h1><p className="muted">Open the library to find your series.</p><Link className="button primary" href="/">Open library</Link></main>;
}
