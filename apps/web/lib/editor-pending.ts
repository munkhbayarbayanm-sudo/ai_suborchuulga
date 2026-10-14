import type {EditorOperationRequest} from '@mongolsub/contracts';

export interface PendingEditorOperation {id:string;documentId:string;createdAt:string;request:EditorOperationRequest}
const databaseName='mongolsub-editor-v1';const storeName='pending-operations';

function database(){return new Promise<IDBDatabase>((resolve,reject)=>{const open=indexedDB.open(databaseName,1);open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains(storeName))open.result.createObjectStore(storeName,{keyPath:'id'});};open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});}
async function transaction<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore,done:(value:T)=>void)=>void){const db=await database();return new Promise<T>((resolve,reject)=>{const tx=db.transaction(storeName,mode);run(tx.objectStore(storeName),resolve);tx.onerror=()=>reject(tx.error);tx.oncomplete=()=>db.close();});}
export async function savePending(operation:PendingEditorOperation){await transaction<void>('readwrite',(store,done)=>{const request=store.put(operation);request.onsuccess=()=>done();});}
export async function removePending(id:string){await transaction<void>('readwrite',(store,done)=>{const request=store.delete(id);request.onsuccess=()=>done();});}
export async function pendingForDocument(documentId:string){return transaction<PendingEditorOperation[]>('readonly',(store,done)=>{const request=store.getAll();request.onsuccess=()=>done((request.result as PendingEditorOperation[]).filter(item=>item.documentId===documentId).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)));});}
export async function clearPending(documentId:string){const items=await pendingForDocument(documentId);await Promise.all(items.map(item=>removePending(item.id)));}
