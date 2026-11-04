import {useId} from 'react';
export type FileFieldProps=Readonly<{label:string;hint?:string;disabled?:boolean;onFile:(file:File)=>void}>;
// Native file selection preserves the platform picker and keyboard semantics.
export function FileField({label,hint,disabled=false,onFile}:FileFieldProps){
 const id=useId();
 return <div className="flex flex-col gap-2"><label htmlFor={id} className="text-sm font-medium text-ink">{label}</label><input id={id} type="file" disabled={disabled} aria-describedby={hint?id+'-hint':undefined} className="block w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50" onChange={event=>{const file=event.target.files?.[0];if(file)onFile(file);event.target.value='';}}/>{hint&&<p id={id+'-hint'} className="text-sm text-ink-muted">{hint}</p>}</div>;
}
