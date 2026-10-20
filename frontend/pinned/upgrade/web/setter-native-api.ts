// Transport adapter only; domain types and labels remain in the original Team app.
export {ApiError,when,LEAD_TYPE_LABEL,LAYER_LABEL} from '@team/components/setter/api';
export type {State,Rule,Overview,Turn,ChatResult,LeadProfile} from '@team/components/setter/api';
import {salesJSON} from './sales-client.mjs';
export function api<T>(path:string,init:{method?:string;body?:unknown}={}):Promise<T>{
 return salesJSON('api/setter/'+path,init);
}
