// Orders page block (customer-account.order-index.block.render): the customer's delivered pieces not yet reviewed, each
// with a REVIEW button to its order's page, where Judge.me's verified "Write a new review" form is. Which products are
// already reviewed comes from the app service; without it, the block falls back to recently fulfilled pieces.
// Shows nothing while loading, when there is nothing to review, or on any orders error.
import '@shopify/ui-extensions/preact';
// This target has no Order API; orders come from fetch(). Its standard API carries the session token.
import type {Api} from '@shopify/ui-extensions/customer-account.order-index.block.render';
declare const shopify: Api;
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {copy} from './copy.mjs';
import {customerAccountQuery, GRID_COLUMNS, RECENT_ORDERS, RECENT_ORDERS_QUERY, stripPieces} from './pieces.mjs';
import {loadReviewed} from './reviewed.mjs';

type Piece = {productId:string;title:string;imageUrl:string|null;imageAlt:string;orderId:string;href:string};
type Strip = {pieces:Piece[];more:number};

export default async function extension(){render(<OrdersStrip/>,document.body);}
// A fresh session token for this customer, for the app service (Shopify caches it until it expires).
function sessionToken(){return shopify.sessionToken.get();}

export function OrdersStrip(){
  const [{pieces,more},setStrip]=useState<Strip>({pieces:[],more:0});
  useEffect(()=>{
    let live=true;
    Promise.all([
      customerAccountQuery(fetch,RECENT_ORDERS_QUERY,{first:RECENT_ORDERS}),
      loadReviewed({fetchImpl:fetch,getToken:sessionToken}),
    ])
      .then(([data,reviewed]:[any,Set<string>|null])=>{if(live)setStrip(stripPieces(data?.customer?.orders?.nodes,reviewed) as Strip);})
      .catch(()=>{if(live)setStrip({pieces:[],more:0});});
    return ()=>{live=false;};
  },[]);
  if(!pieces.length)return null;
  return <s-section>
    <s-stack gap="base">
      <s-stack gap="small-100">
        <s-text type="small" color="subdued">{copy.eyebrow}</s-text>
        <s-heading>{copy.orders.heading}</s-heading>
        <s-paragraph>{copy.orders.body}</s-paragraph>
      </s-stack>
      <s-query-container>
        <s-grid gridTemplateColumns={GRID_COLUMNS} gap="base">
          {pieces.map(piece=><s-stack key={piece.productId} gap="small-200">
            {piece.imageUrl?<s-image src={piece.imageUrl} alt={piece.imageAlt} aspectRatio="1/1" objectFit="cover" borderRadius="base" loading="lazy"/>:null}
            <s-text>{piece.title}</s-text>
            <s-button href={piece.href} variant="secondary" inlineSize="fill" accessibilityLabel={copy.orders.buttonLabel(piece.title)}>{copy.orders.button}</s-button>
          </s-stack>)}
        </s-grid>
      </s-query-container>
      {more>0?<s-text color="subdued">{copy.orders.more(more)}</s-text>:null}
    </s-stack>
  </s-section>;
}
