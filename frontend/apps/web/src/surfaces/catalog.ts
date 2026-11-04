import {createRegistry,type RouteCatalog} from '@community-go/plugin-framework';

// Navigation composition only; Next App Router owns rendering and navigation.
function surface(pluginId:string,pages:readonly {id:string;path:string;label:string}[]){
 const catalog:RouteCatalog={
  plugins:[{pluginId,mount:'/'}],
  routes:pages.map(page=>({routeId:page.id,pluginId,path:page.path,segments:page.path.split('/').filter(Boolean),pattern:page.path,paramNames:[]})),
  aliases:[{groupId:'main',labelKey:'main'}],
  contributions:[{pluginId,contribution:{parents:pages.map((page,index)=>({navigationId:pluginId+'.'+page.id,labelKey:page.label,groupId:'main',routeId:page.id,order:index}))}}],
 };
 const registry=createRegistry(catalog);
 if(registry.diagnostics.length)throw Error('Invalid product navigation composition');
 return registry;
}
export const webmailSurface=surface('webmail',[{id:'mail',path:'/',label:'邮箱'},{id:'account',path:'/account/',label:'个人设置'}]);
export const operationsSurface=surface('operations',[{id:'admin',path:'/admin/',label:'平台运营'}]);
