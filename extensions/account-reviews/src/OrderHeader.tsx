// Order page block (customer-account.order-status.block.render), placed above Judge.me's "Write a new review":
// a short prompt and this order's piece photos, once the order counts: fulfilled as a whole, or placed 14 days ago or
// more (pieces.mjs). No buttons of its own. When the app service says which products the customer already reviewed,
// only the pieces not yet reviewed show, and nothing at all once every piece is reviewed. Shows nothing while loading,
// when the order does not count yet or is cancelled, or on any orders error. Unlike the Orders page, no welcome here.
import '@shopify/ui-extensions/preact';
import type {Api} from '@shopify/ui-extensions/customer-account.order-status.block.render';
declare const shopify: Api;
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {copy} from './copy.mjs';
import {customerAccountQuery, orderPieces, ORDER_QUERY} from './pieces.mjs';
import {loadReviewed} from './reviewed.mjs';

type Piece = {productId:string;title:string;imageUrl:string|null;imageAlt:string};

export default async function extension(){render(<OrderHeader/>,document.body);}
// A fresh session token for this customer, for the app service (Shopify caches it until it expires).
function sessionToken(){return shopify.sessionToken.get();}

export function OrderHeader(){
  const [pieces,setPieces]=useState<Piece[]>([]);
  const orderId=shopify.order.value?.id;
  useEffect(()=>{
    let live=true;
    setPieces([]);
    if(!orderId)return;
    Promise.all([
      customerAccountQuery(fetch,ORDER_QUERY,{id:orderId}),
      loadReviewed({fetchImpl:fetch,getToken:sessionToken}),
    ])
      .then(([data,reviewed]:[any,Set<string>|null])=>{if(live)setPieces((orderPieces(data?.order,{reviewed}) as Piece[]).filter(piece=>piece.imageUrl));})
      .catch(()=>{if(live)setPieces([]);});
    return ()=>{live=false;};
  },[orderId]);
  if(!pieces.length)return null;
  return <s-section>
    <s-stack gap="base">
      <s-stack gap="small-100">
        <s-text type="small" color="subdued">{copy.eyebrow}</s-text>
        <s-heading>{copy.order.heading}</s-heading>
        <s-paragraph>{copy.order.body}</s-paragraph>
      </s-stack>
      <s-stack direction="inline" gap="base" accessibilityLabel={copy.order.photosLabel}>
        {pieces.map(piece=><s-product-thumbnail key={piece.productId} src={piece.imageUrl as string} alt={piece.imageAlt}/>)}
      </s-stack>
    </s-stack>
  </s-section>;
}
