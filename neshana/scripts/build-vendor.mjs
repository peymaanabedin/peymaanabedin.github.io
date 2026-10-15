import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
// npm's ESM entry points still contain bare imports. Ship browser bundles instead.
for(const [entry,name] of [['protomaps-leaflet','protomaps'],['pmtiles','pmtiles']]){
  const result=await build({absWorkingDir:root,entryPoints:[entry],outfile:`dist/vendor/${name}.mjs`,bundle:true,platform:'browser',format:'esm',target:['safari16.4','chrome109','firefox115'],minify:true,legalComments:'eof',metafile:true,write:false});
  for(const output of Object.values(result.metafile.outputs))if(output.imports.length)throw Error(`Unbundled dependency in ${name}: ${JSON.stringify(output.imports)}`);
  const {writeFile}=await import('node:fs/promises');
  for(const file of result.outputFiles)await writeFile(file.path,file.contents);
  console.log(`${name}: ${result.outputFiles[0].contents.length} bytes; no external imports`);
}
