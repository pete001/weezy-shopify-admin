// Orders page block (customer-account.order-index.block.render): the customer's pieces not yet reviewed, each with a
// REVIEW button to its order's page, where Judge.me's verified "Write a new review" form is. An order counts only
// once fulfilled as a whole, as Judge.me's form needs (pieces.mjs). Which products are already reviewed comes from
// the app service; without it, the block falls back to pieces from recent counted orders.
// When the orders answer but there is nothing to review (no orders yet included), it shows a welcome with a button to
// the shop instead, so the page is never bare. Shows nothing while loading or on any orders error.
import '@shopify/ui-extensions/preact';
// This target has no Order API; orders come from fetch(). Its standard API carries the session token.
import type {Api} from '@shopify/ui-extensions/customer-account.order-index.block.render';
declare const shopify: Api;
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {copy} from './copy.mjs';
import {customerAccountQuery, GRID_COLUMNS, ordersBlockView, RECENT_ORDERS, RECENT_ORDERS_QUERY, SHOP_URL, stripPieces} from './pieces.mjs';
import {loadReviewed} from './reviewed.mjs';

type Piece = {productId:string;title:string;imageUrl:string|null;imageAlt:string;orderId:string;href:string};
type Strip = {pieces:Piece[];more:number};
type OrdersState = {status:'loading'}|{status:'failed'}|{status:'ready';strip:Strip};

export default async function extension(){render(<OrdersStrip/>,document.body);}
// A fresh session token for this customer, for the app service (Shopify caches it until it expires).
function sessionToken(){return shopify.sessionToken.get();}

export function OrdersStrip(){
  const [state,setState]=useState<OrdersState>({status:'loading'});
  useEffect(()=>{
    let live=true;
    Promise.all([
      customerAccountQuery(fetch,RECENT_ORDERS_QUERY,{first:RECENT_ORDERS}),
      loadReviewed({fetchImpl:fetch,getToken:sessionToken}),
    ])
      .then(([data,reviewed]:[any,Set<string>|null])=>{if(live)setState({status:'ready',strip:stripPieces(data?.customer?.orders?.nodes,reviewed) as Strip});})
      .catch(()=>{if(live)setState({status:'failed'});});
    return ()=>{live=false;};
  },[]);
  const view=ordersBlockView(state);
  if(view==='welcome')return <Welcome/>;
  if(view!=='strip'||state.status!=='ready')return null;
  const {pieces,more}=state.strip;
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

// Nothing to review: a welcome in the same shape as the strip, with one button to the shop. The button's target is
// left at its default ('auto'): customer accounts open the https link themselves, in the same tab or a new one.
function Welcome(){
  return <s-section>
    <s-stack gap="base">
      <s-stack gap="small-100">
        <s-text type="small" color="subdued">{copy.welcome.eyebrow}</s-text>
        <s-heading>{copy.welcome.heading}</s-heading>
        <s-paragraph>{copy.welcome.body}</s-paragraph>
      </s-stack>
      <s-button href={SHOP_URL} variant="primary">{copy.welcome.button}</s-button>
    </s-stack>
  </s-section>;
}
