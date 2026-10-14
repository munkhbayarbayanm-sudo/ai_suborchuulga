'use client';

import Link from 'next/link';
import {useRef,useState} from 'react';
import {subtitleDocumentPageSchema,subtitleDocumentSchema} from '@mongolsub/contracts';
import {errorText,request} from '../lib/api';
import {useResource} from '../lib/use-resource';
import {ErrorNotice,LoadingRows} from './ui';

export function SubtitleEditorLauncher({episodeId,activeLocalizationRunId}:{episodeId:string;activeLocalizationRunId:string|null}){
  const documents=useResource(`/episodes/${episodeId}/subtitle-documents?offset=0&limit=100`,subtitleDocumentPageSchema);const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const key=useRef(crypto.randomUUID());
  async function create(){if(!activeLocalizationRunId)return;setBusy(true);setError(null);try{const document=await request(`/localization-runs/${activeLocalizationRunId}/subtitle-documents`,subtitleDocumentSchema,{method:'POST',body:{name:'Mongolian subtitles',initializationKey:key.current}});window.location.assign(`/episodes/${episodeId}/editor?document=${document.id}`);}catch(cause){setError(errorText(cause));}finally{setBusy(false);}}
  const active=documents.data?.items.find(item=>item.id===documents.data?.activeDocumentId)??documents.data?.items[0];
  return <section className="editor-launcher"><div className="panel-heading"><h2>Professional subtitle editor</h2><span className="muted">Phase 05 · derived editable cues</span></div><div className="editor-launcher-body">{documents.error?<ErrorNotice message={documents.error} retry={documents.refresh}/>:documents.loading&&!documents.data?<LoadingRows/>:<><div><strong>{active?`${active.cueCount} editable Mongolian cues`:'No subtitle document yet'}</strong><p className="field-help">Video preview, waveform, snapping, split/merge, auditable undo and AI rewrite proposals. Canonical transcript and localization evidence remain unchanged.</p></div><div className="editor-launcher-actions">{active&&<Link className="button primary" href={`/episodes/${episodeId}/editor?document=${active.id}`}>Open editor</Link>}<button className="button secondary" disabled={busy||!activeLocalizationRunId} onClick={()=>void create()}>{busy?'Preparing…':active?'Create another revision':'Create editor document'}</button></div>{!activeLocalizationRunId&&<p className="panel-empty">Activate a completed LocalizationRun before creating editable cues.</p>}{error&&<ErrorNotice message={error}/>}</>}</div></section>;
}
