import {VideoEditorWorkspace} from '../../../../components/video-editor';

export default async function VideoEditorPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{project?:string}>}){const[{id},{project}]=await Promise.all([params,searchParams]);return <VideoEditorWorkspace episodeId={id} initialProjectId={project??null}/>;}
