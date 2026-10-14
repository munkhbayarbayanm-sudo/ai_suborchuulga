import {SubtitleEditorWorkspace} from '../../../../components/subtitle-editor';

export default async function EditorPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{document?:string}>}){
  const [{id},{document}]=await Promise.all([params,searchParams]);
  return <SubtitleEditorWorkspace episodeId={id} initialDocumentId={document??null}/>;
}
