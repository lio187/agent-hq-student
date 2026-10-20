// Linear palette for canvas and Three.js, which cannot read CSS custom properties.
// Values must match tokens.css (tests/test_design_tokens.mjs checks this).
export const TOKENS={void:'#08090a',carbon:'#0f1011',obsidian:'#161718',graphite:'#23252a',smoke:'#383b3f',ash:'#62666d',fog:'#8a8f98',mist:'#d0d6e0',bone:'#e5e5e6',paper:'#ffffff',lime:'#e4f222',green:'#27a644',coral:'#eb5757',teal:'#02b8cc',iris:'#6366f1',lavender:'#8b5cf6'};
// The office floor: graphite plinths with hairline edges; lime only marks live work.
export const OFFICE={
 plinth:'#18191c',floorBody:'#131417',edge:'#3a3e46',edgeCommand:'#5a5f69',
 floor:{ecom:'#222326',outreach:'#212326',growth:'#232226',content:'#212325',revenue:'#232325',operations:'#222227',build:'#212426',finance:'#222226',command:'#2a2c31'},
 desk:'#34363c',deskPed:'#24262a',monitor:'#141518',stand:'#33363b',keyboard:'#3c3f45',
 chairSeat:'#2e3035',chairBack:'#27292d',metal:'#3b3d42',pants:'#25272b',leadShirt:'#3d424e',pin:'#d0d6e0',
 // Agent identity colours are the original 187N department colours (owner request, 4 October 2026).
 shirts:{ecom:'#c98e74',outreach:'#95ad8e',growth:'#c98e74',content:'#95ad8e',revenue:'#c8b36d',operations:'#ac99ba',build:'#81a8b2',finance:'#9999b8',command:'#ef6b34'},
 screens:{build:'#7b9fac',content:'#89a180',growth:'#c7866c',revenue:'#bda459',finance:'#9797b8',operations:'#a392b8',ecom:'#c7866c',outreach:'#89a180',command:'#e8753e'},
 pot:'#2c2e33',foliage:'#3a6447',foliage2:'#467352',table:'#26282c',tableLeg:'#3a3c41',walkway:'#18191c',bridge:'#1a1b1e',server:'#1c1d20',serverSlot:'#26282c',
 brain:'#18191c',graph:'#62666d',graphDot:'#d0d6e0',active:'#e4f222',alert:'#eb5757',dimTint:'#08090a',
 hemiSky:'#d0d6e0',hemiGround:'#0b0c0d',sun:'#ffffff',hemi:2.1,sunIntensity:2.3,shadow:.5
};
