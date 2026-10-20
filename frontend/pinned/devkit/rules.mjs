// What the developer kit keeps, cuts and rewrites. The kit is the dashboard only: no owner data, no creative engine
// (Studio, Production, Creator Lab, Brand Factory, Content OS, campaigns, carousels and stories, research walls),
// no owner products (Setter, Proposals, Handbook, course community). Sources connect through the kit's server.

// Views removed from the page engine (workspace-view.mjs), with the action branches only they used.
export const REMOVED_VIEWS = ['messages', 'reels', 'brands', 'team', 'content', 'board', 'record', 'reviews', 'campaigns', 'research', 'social',
  'competitors', 'creatorlab', 'studio', 'handbook', 'setter', 'proposals', 'leoncontent', 'accounts', 'production', 'community', 'voice'];
export const REMOVED_ACTIONS = ['account-all', 'review-pick', 'studio-make', 'engine-open', 'video-wall', 'video-play', 'setter-tab', 'proposal-open',
  'proposal-close', 'creator-pane', 'item', 'idea-from-post', 'new-content', 'read-script', 'campaign', 'copy-caption', 'review', 'source',
  'competitor-research', 'new-follow-up', 'follow-up', 'sales-record', 'research-detail', 'revenue-period'];
export const REMOVED_ACTION_PREFIXES = ['review-'];
// Factories whose result may be dropped once nothing uses it.
export const PRUNE_CALLS = ['createEngineControls', 'createContentEditor', 'createContentReader', 'createMissionControlViews_unused'];

// Modules that must never be reachable in the kit (the export fails with the import chain if one is).
export const FORBIDDEN = ['content-engine-controls', 'content-create', 'content-editor', 'content-os-feed', 'content-selection', 'content-review',
  'content-save', 'content-comment', 'content-conflict', 'caption-approval', 'studio-view', 'creator-research', 'creator-radar', 'creator-analysis',
  'creator-client', 'creator-connections', 'creator-media', 'creator-progress', 'creator-radar-controls', 'creator-replay', 'creator-scatter',
  'creator-wall', 'creator-watchlists', 'creator-embed', 'brand-embed', 'content-os-embed', 'marketing-visuals', 'social-view', 'competitor-view',
  'local-sales', 'handbook-native', 'community-review', 'sales-followup', 'engine-view', 'team', 'team-pages', 'messages',
  'voice-console'];
