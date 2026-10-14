import {SeriesQC} from '../../../../components/series-qc';

export default async function SeriesQualityPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <SeriesQC seriesId={id}/>;}
