import {h, type JSX} from 'preact';

// Shopify's remote custom elements may not expose DOM on* properties when
// created. Explicit lowercase event names avoid Preact registering "Click"
// instead of the native "click" event on controls added after initial render.
export function Button({onClick,...props}:JSX.IntrinsicElements['s-button']) {
 return h('s-button',{...props,onclick:onClick});
}
export function Clickable({onClick,...props}:JSX.IntrinsicElements['s-clickable']) {
 return h('s-clickable',{...props,onclick:onClick});
}
export function TextField({onInput,...props}:JSX.IntrinsicElements['s-text-field']) {
 return h('s-text-field',{...props,oninput:onInput});
}
export function SearchField({onInput,...props}:JSX.IntrinsicElements['s-search-field']) {
 return h('s-search-field',{...props,oninput:onInput});
}
export function Checkbox({onChange,...props}:JSX.IntrinsicElements['s-checkbox']) {
 return h('s-checkbox',{...props,onchange:onChange});
}

export function Select({onChange,...props}:JSX.IntrinsicElements['s-select']) {
 return h('s-select',{...props,onchange:onChange});
}

export function TextArea({onInput,...props}:JSX.IntrinsicElements['s-text-area']) {
 return h('s-text-area',{...props,oninput:onInput});
}
