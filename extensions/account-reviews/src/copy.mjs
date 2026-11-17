// Every customer-facing word in the account review blocks, in one place so it is easy to change.
// Plain British English, "Weezy Pop" never "Weezy" on its own, no em dashes, gender-neutral, "basket" never "cart".
// tests/account-reviews.test.mjs checks these rules.
export const copy = {
  eyebrow: '✦ YOUR SAY',
  orders: {
    heading: 'Loving your new sparkle?',
    body: 'Tap a piece to share the love. Leave an honest review and get 10% off your next order as a thank-you.',
    button: 'REVIEW',
    // The button's accessibility label names the piece: "Review Cherry Charm".
    buttonLabel: (title) => `Review ${title}`,
    // The photo's alt text when Shopify has none for it.
    photoAlt: (title) => title,
    // Under the grid when more pieces are waiting than it shows (12): "And 3 more pieces waiting for your review".
    more: (count) => `And ${count} more ${Number(count) === 1 ? 'piece' : 'pieces'} waiting for your review`,
  },
  order: {
    heading: 'Your sparkle, your say',
    body: 'Tap Write a new review below to review each piece. Leave an honest review and get 10% off your next order as a thank-you.',
    // The row of this order's photos, read out by screen readers.
    photosLabel: 'Pieces in this order',
  },
};
