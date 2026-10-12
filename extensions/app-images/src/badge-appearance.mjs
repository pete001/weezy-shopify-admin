// Optional set artwork only. These choices never change ownership or the shop.
export const BADGE_DEFAULT_COLOUR='#C9B6FF';
export const BADGE_COLOURS=[
 {name:'Lilac',hex:'#C9B6FF'}, {name:'Butter yellow',hex:'#F7D44C'},
 {name:'Candy pink',hex:'#FAB7EB'}, {name:'Weezy pink',hex:'#FF3660'},
];
export function validBadgeAppearance(set){
 return (set.badge_color===undefined||typeof set.badge_color==='string'&&/^#[a-f0-9]{6}$/i.test(set.badge_color))&&
  (set.badge_hero_handle===undefined||set.member_handles.includes(set.badge_hero_handle));
}
export function retainedBadgeHero(set,handles){return handles.includes(set.badge_hero_handle)?set.badge_hero_handle:undefined;}
export function badgeMemberPhoto(product){return product?.images?.find(image=>!image.hidden)?.url??null;}
