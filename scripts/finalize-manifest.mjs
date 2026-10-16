import { readFile,writeFile } from "node:fs/promises";
const path=new URL("../openclaw.plugin.json",import.meta.url);
const manifest=JSON.parse(await readFile(path,"utf8"));
for(const name of ["commander_pod_create","commander_pod_update","commander_pod_delete","commander_simulate"]){
  manifest.toolMetadata??={};
  manifest.toolMetadata[name]={...(manifest.toolMetadata[name]??{}),sideEffecting:true};
}
await writeFile(path,`${JSON.stringify(manifest,null,2)}\n`);
