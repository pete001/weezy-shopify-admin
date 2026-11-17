// Orders page block (customer-account.order-index.block.render): the customer's recently fulfilled pieces, each with
// a REVIEW button to its order's page, where Judge.me's verified "Write a new review" form is.
// Shows nothing while loading, when there is nothing to review, or on any error.
import '@shopify/ui-extensions/preact';
// Type-only: brings in the customer account component types. This target has no Order API; orders come from fetch().
import type {} from '@shopify/ui-extensions/customer-account.order-index.block.render';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {copy} from './copy.mjs';
import {customerAccountQuery, GRID_COLUMNS, pickPieces, RECENT_ORDERS, RECENT_ORDERS_QUERY} from './pieces.mjs';

type Piece = {productId:string;title:string;imageUrl:string|null;imageAlt:string;orderId:string;href:string};

export default async function extension(){render(<OrdersStrip/>,document.body);}

export function OrdersStrip(){
  const [pieces,setPieces]=useState<Piece[]>([]);
  useEffect(()=>{
    let live=true;
    customerAccountQuery(fetch,RECENT_ORDERS_QUERY,{first:RECENT_ORDERS})
      .then((data:any)=>{if(live)setPieces(pickPieces(data?.customer?.orders?.nodes) as Piece[]);})
      .catch(()=>{if(live)setPieces([]);});
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
    </s-stack>
  </s-section>;
}
