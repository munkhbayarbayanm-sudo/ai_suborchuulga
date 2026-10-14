import type {VideoOperationRequest} from '@mongolsub/contracts';

export interface PendingVideoOperation{id:string;projectId:string;createdAt:string;request:VideoOperationRequest}
const databaseName='mongolsub-video-project-v1';const storeName='pending-operations';
function database(){return new Promise<IDBDatabase>((resolve,reject)=>{const open=indexedDB.open(databaseName,1);open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains(storeName))open.result.createObjectStore(storeName,{keyPath:'id'});};open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});}
async function transaction<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore,done:(value:T)=>void)=>void){const db=await database();return new Promise<T>((resolve,reject)=>{const tx=db.transaction(storeName,mode);run(tx.objectStore(storeName),resolve);tx.onerror=()=>reject(tx.error);tx.oncomplete=()=>db.close();});}
export async function savePendingVideo(operation:PendingVideoOperation){await transaction<void>('readwrite',(store,done)=>{const request=store.put(operation);request.onsuccess=()=>done();});}
export async function removePendingVideo(id:string){await transaction<void>('readwrite',(store,done)=>{const request=store.delete(id);request.onsuccess=()=>done();});}
export async function pendingForProject(projectId:string){return transaction<PendingVideoOperation[]>('readonly',(store,done)=>{const request=store.getAll();request.onsuccess=()=>done((request.result as PendingVideoOperation[]).filter(item=>item.projectId===projectId).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)));});}
export async function clearPendingVideo(projectId:string){const items=await pendingForProject(projectId);await Promise.all(items.map(item=>removePendingVideo(item.id)));}
