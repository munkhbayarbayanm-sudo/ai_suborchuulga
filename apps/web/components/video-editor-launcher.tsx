'use client';

import Link from 'next/link';
import {useRef,useState} from 'react';
import {videoProjectDetailSchema,videoProjectPageSchema} from '@mongolsub/contracts';
import {errorText,request} from '../lib/api';
import {useResource} from '../lib/use-resource';
import {ErrorNotice,LoadingRows} from './ui';

export function VideoEditorLauncher({episodeId}:{episodeId:string}){
  const projects=useResource(`/episodes/${episodeId}/video-projects?offset=0&limit=100`,videoProjectPageSchema);const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const key=useRef(crypto.randomUUID());const active=projects.data?.items.find(item=>item.id===projects.data?.activeProjectId)??projects.data?.items[0];
  async function create(){setBusy(true);setError(null);try{const detail=await request(`/episodes/${episodeId}/video-projects`,videoProjectDetailSchema,{method:'POST',body:{name:'Editorial cut',canvasPreset:'ORIGINAL',initializationKey:key.current}});key.current=crypto.randomUUID();window.location.assign(`/episodes/${episodeId}/video-editor?project=${detail.project.id}`);}catch(cause){setError(errorText(cause));}finally{setBusy(false);}}
  return <section className="editor-launcher video-editor-launcher"><div className="panel-heading"><h2>Non-destructive video editor</h2><span className="muted">Phase 07 · project timeline</span></div><div className="editor-launcher-body">{projects.error?<ErrorNotice message={projects.error} retry={projects.refresh}/>:projects.loading&&!projects.data?<LoadingRows/>:<><div><strong>{active?`${active.name} · ${active.durationMs?Math.round(active.durationMs/1000):0}s timeline`:'No edit project yet'}</strong><p className="field-help">Cut, trim, transform, mix audio, place text/images and timed blur while preserving source media and subtitle documents.</p></div><div className="editor-launcher-actions">{active&&<Link className="button primary" href={`/episodes/${episodeId}/video-editor?project=${active.id}`}>Open video editor</Link>}<button className="button secondary" disabled={busy} onClick={()=>void create()}>{busy?'Creating…':active?'Create another project':'Create video project'}</button></div>{error&&<ErrorNotice message={error}/>}</>}</div></section>;
}
