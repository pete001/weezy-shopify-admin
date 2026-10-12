// Published Shopify product handles can contain underscores (the live O-Ring
// handle does). Keep paths, encoding and synthetic helper prefixes out.
export const productHandlePattern=/^[a-z0-9][a-z0-9_-]{0,199}$/;
export const validProductHandle=value=>typeof value==='string'&&productHandlePattern.test(value);
