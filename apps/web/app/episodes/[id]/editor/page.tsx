import {SubtitleEditorWorkspace} from '../../../../components/subtitle-editor';

export default async function EditorPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{document?:string;cue?:string;time?:string}>}){
  const [{id},{document,cue,time}]=await Promise.all([params,searchParams]);const parsedTime=time===undefined?null:Number(time);
  return <SubtitleEditorWorkspace episodeId={id} initialDocumentId={document??null} initialCueId={cue??null} initialTimeMs={parsedTime!==null&&Number.isFinite(parsedTime)?parsedTime:null}/>;
}
