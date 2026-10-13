import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runProcess } from '../packages/media/src/index';
export async function createFixture(output: string, executable = 'ffmpeg'): Promise<void> {
  await mkdir(dirname(output), { recursive: true });
  const subtitle = `${output}.srt`;
  await writeFile(subtitle, '1\n00:00:00,100 --> 00:00:01,900\nSynthetic fixture.\n', 'utf8');
  try {
    const result = await runProcess(executable, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-i', subtitle, '-t', '2', '-map', '0:v', '-map', '1:a', '-map', '2:s', '-c:v', 'mpeg4', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-c:s', 'srt', '-metadata:s:s:0', 'language=eng', output], 30000);
    if (result.exitCode !== 0) throw new Error(`Synthetic fixture generation failed (exit ${result.exitCode}).`);
  } finally { await rm(subtitle, { force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await createFixture(resolve('data/fixtures/synthetic.mkv'), process.env.FFMPEG_PATH ?? 'ffmpeg');
  console.info('Created data/fixtures/synthetic.mkv (generated video/audio/subtitle).');
}
