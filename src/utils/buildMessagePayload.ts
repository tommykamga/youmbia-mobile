/**
 * Build a message payload for future messagerie flow.
 * No persistence. Preparation only (Sprint 4.2).
 */

export type BuildMessagePayloadParams = {
  listingId: string;
  sellerId: string;
  buyerId: string;
};

export type MessagePayload = {
  listingId: string;
  sellerId: string;
  buyerId: string;
  createdAt: number;
};

export function buildMessagePayload(params: BuildMessagePayloadParams): MessagePayload {
  const { listingId, sellerId, buyerId } = params;
  return {
    listingId,
    sellerId,
    buyerId,
    createdAt: Date.now(),
  };
}
