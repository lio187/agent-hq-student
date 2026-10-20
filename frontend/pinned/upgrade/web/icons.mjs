// Minimal 16px line icons in the Linear manner: one stroke weight, currentColor, no fills.
const svg=body=>'<svg class="ui-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+body+'</svg>';
export const ICONS={
 office:svg('<path d="M2.5 13.5V6l5.5-3.5L13.5 6v7.5"/><path d="M6 13.5v-4h4v4"/><path d="M1.5 13.5h13"/>'),
 overview:svg('<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>'),
 brain:svg('<circle cx="8" cy="8" r="2"/><circle cx="3" cy="4" r="1.2"/><circle cx="13" cy="4" r="1.2"/><circle cx="3.5" cy="12.5" r="1.2"/><circle cx="12.5" cy="12.5" r="1.2"/><path d="M4 4.7 6.5 6.8M12 4.7 9.5 6.8M4.4 11.8l2.2-2.4M11.6 11.8 9.4 9.4"/>'),
 bell:svg('<path d="M4 11.5V7a4 4 0 0 1 8 0v4.5l1 1H3Z"/><path d="M6.5 14a1.5 1.5 0 0 0 3 0"/>'),
 inbox:svg('<path d="M2 9.5 3.6 3.2A1 1 0 0 1 4.6 2.5h6.8a1 1 0 0 1 1 .7L14 9.5V13a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 2 13Z"/><path d="M2 9.5h3.5l1 1.5h3l1-1.5H14"/>'),
 search:svg('<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/>'),
 settings:svg('<circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>'),
 plug:svg('<path d="M6 2v3M10 2v3"/><path d="M4.5 5h7v2.5a3.5 3.5 0 0 1-7 0Z"/><path d="M8 11v3"/>'),
 chevron:svg('<path d="m6 4 4 4-4 4"/>'),
 plus:svg('<path d="M8 3v10M3 8h10"/>'),
 chat:svg('<path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2Z"/>'),
 mic:svg('<rect x="6" y="2" width="4" height="7.5" rx="2"/><path d="M3.5 8a4.5 4.5 0 0 0 9 0M8 12.5V14"/>'),
 board:svg('<rect x="2" y="2.5" width="3.5" height="11" rx="1"/><rect x="6.5" y="2.5" width="3.5" height="7" rx="1"/><rect x="11" y="2.5" width="3" height="9" rx="1"/>'),
 bolt:svg('<path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8Z"/>'),
 menu:svg('<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>'),
 close:svg('<path d="m4 4 8 8M12 4l-8 8"/>'),
 keyboard:svg('<rect x="1.5" y="4" width="13" height="8" rx="1.5"/><path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M5 9.5h6"/>'),
 // departments
 today:svg('<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/>'),
 operations:svg('<path d="m8 2 6 3-6 3-6-3Z"/><path d="m2 8 6 3 6-3"/><path d="m2 11 6 3 6-3"/>'),
 marketing:svg('<path d="M2.5 6.5v3h2l5 3v-9l-5 3Z"/><path d="M12 5.5a3 3 0 0 1 0 5"/>'),
 sales:svg('<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r=".6"/>'),
 delivery:svg('<path d="m8 1.8 5.5 3v6.4L8 14.2l-5.5-3V4.8Z"/><path d="M2.5 4.8 8 8l5.5-3.2M8 8v6.2"/>'),
 course:svg('<path d="m1.5 6 6.5-3 6.5 3-6.5 3Z"/><path d="M4.5 7.5V11c0 .8 1.6 2 3.5 2s3.5-1.2 3.5-2V7.5"/>'),
 tech:svg('<rect x="4" y="4" width="8" height="8" rx="1.5"/><rect x="6.5" y="6.5" width="3" height="3" rx=".5"/><path d="M6 1.5V4M10 1.5V4M6 12v2.5M10 12v2.5M1.5 6H4M1.5 10H4M12 6h2.5M12 10h2.5"/>'),
 finance:svg('<ellipse cx="8" cy="4.5" rx="5" ry="2"/><path d="M3 4.5v3.5c0 1.1 2.2 2 5 2s5-.9 5-2V4.5"/><path d="M3 8v3.5c0 1.1 2.2 2 5 2s5-.9 5-2V8"/>'),
 people:svg('<circle cx="6" cy="5.5" r="2.5"/><path d="M1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/><path d="M10.5 3.2a2.5 2.5 0 0 1 0 4.6M12 9.8c1.5.5 2.5 1.8 2.5 3.7"/>'),
 knowledge:svg('<path d="M3 2.5h7.5L13 5v8.5H3Z"/><path d="M10.5 2.5V5H13M5.5 8h5M5.5 10.5h5"/>')
};
export const icon=name=>ICONS[name]||ICONS.overview;
