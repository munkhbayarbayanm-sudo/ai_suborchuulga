import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runProcess } from '../packages/media/src/index';
export async function createSourceFixture(output:string,exe=process.env.FFMPEG_PATH??'ffmpeg') {
  await mkdir(dirname(output),{recursive:true});
  const english=`${output}.en.srt`; const chinese=`${output}.zh.ass`; const traditional=`${output}.tw.srt`;
  await writeFile(english,'1\n00:00:00,200 --> 00:00:01,400\nHello, traveler.\n\n2\n00:00:01,500 --> 00:00:02,800\nCome back soon.\n');
  await writeFile(traditional,'1\n00:00:00,300 --> 00:00:02,500\n我不會離開你。\n');
  await writeFile(chinese,'[Script Info]\nScriptType: v4.00+\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,24,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.40,0:00:02.60,Default,,0,0,0,,{\\an8}{\\i1}你竟敢背叛本王\\N不要离开。\n');
  try {
    const result=await runProcess(exe,['-nostdin','-y','-v','error','-f','lavfi','-i','testsrc=size=640x360:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-f','lavfi','-i','sine=frequency=660:sample_rate=48000','-i',english,'-i',chinese,'-i',traditional,'-map','0:v','-map','1:a','-map','2:a','-map','3:s','-map','4:s','-map','5:s','-t','3','-c:v','mpeg4','-pix_fmt','yuv420p','-c:a','pcm_s16le','-c:s:0','srt','-c:s:1','ass','-c:s:2','srt','-metadata:s:a:0','language=eng','-metadata:s:a:1','language=zho','-metadata:s:a:0','title=English test audio','-metadata:s:a:1','title=Chinese test audio','-metadata:s:s:0','language=eng','-metadata:s:s:0','title=English source','-metadata:s:s:1','language=chi','-metadata:s:s:1','title=Simplified Chinese source','-metadata:s:s:2','language=zh-Hant','-metadata:s:s:2','title=Traditional Chinese source',output],30000);
    if(result.exitCode!==0)throw new Error('Multilingual fixture generation failed.');
  } finally {await Promise.all([english,chinese,traditional].map(path=>rm(path,{force:true})));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){await createSourceFixture(resolve('data/fixtures/sources.mkv'));console.info('Created legal multilingual source fixture data/fixtures/sources.mkv');}
