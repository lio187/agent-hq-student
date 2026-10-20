// Plain-language labels for source codes (6 October 2026): statuses, event kinds, engine lanes and media types
// are shown as words, never as snake_case, dotted keys or upper-case API constants.
const KNOWN={
 'hooks.generate':'Generate hooks','hooks.rank':'Rank hooks','publish.draft':'Publish as draft (never live)',
 'lane.yap':'Talking head','lane.tutorial':'Tutorial','lane.splitscreen':'Split screen','lane.lifestyle':'Lifestyle','lane.remake':'Remake',
 'lane.clips':'Clips','lane.motion':'Motion design','lane.carousel':'Carousel','lane.stories':'Stories',
 CAROUSEL_ALBUM:'Carousel',VIDEO:'Video',IMAGE:'Image',REELS:'Reel',REEL:'Reel',STORY:'Story',
 waiting_for_approval:'Waiting for approval',waiting_for_input:'Waiting for an answer',in_progress:'In progress',
 approve:'Approve',reject:'Reject',rehook:'New hook',warmup:'Warm-up',ok:'OK',
};
export function label(value){
 const raw=String(value??'').trim();if(!raw)return '';
 if(KNOWN[raw])return KNOWN[raw];
 if(!/[_.]|^[A-Z0-9_]+$/.test(raw))return raw;
 const words=raw.replace(/[_.]+/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
 return words.charAt(0).toUpperCase()+words.slice(1);
}

// Connector service ids as product names (moved from tech-views.mjs, 7 Oct 2026, so Overview and Inbox use them too).
const SERVICE_NAME={googlecalendar:'Google Calendar',googledocs:'Google Docs',googledrive:'Google Drive',googlemeet:'Google Meet',google_maps:'Google Maps',gmail:'Gmail',github:'GitHub',hermon:'Hermon CRM','fathom-oauth':'Fathom (OAuth)',fathom:'Fathom','whatsapp-native':'WhatsApp (native)',whatsapp:'WhatsApp',zernio_mcp:'Zernio MCP','content-os':'Content OS',linkedin:'LinkedIn',youtube:'YouTube',supabase:'Supabase',vercel:'Vercel',notion:'Notion',slack:'Slack',todoist:'Todoist',calendly:'Calendly',figma:'Figma',kit:'Kit',whop:'Whop',time:'Time',notes:'Notes'};
export const serviceName=n=>SERVICE_NAME[n]||String(n||'Service').replace(/[_-]+/g,' ').replace(/^\w/,c=>c.toUpperCase());
