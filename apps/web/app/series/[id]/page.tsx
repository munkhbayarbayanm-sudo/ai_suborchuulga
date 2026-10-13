import { SeriesWorkspace } from '../../../components/series-workspace';

export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SeriesWorkspace key={id} id={id} />;
}
