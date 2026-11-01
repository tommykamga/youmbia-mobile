import { supabase } from '@/lib/supabase';
import { createListingDraft, updateListingDraft, type SaveListingDraftPayload } from './createListingDraft';
import { checkListingPublishDailyQuota } from './checkListingPublishDailyQuota';
import { removeListingDetailSession } from './listingDetailSessionCache';

async function publicationRpc(name: 'prepare_listing_publication' | 'finalize_listing_publication', id: string) {
  const { data, error } = await supabase.rpc(name, { p_listing_id: id });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row || row.id !== id) throw new Error('Impossible de vérifier la publication. Réessayez.');
  return row;
}

/** Two-phase publication. Preparation errors keep the database draft, never delete it.
 * The UI records the id before any media work. An acknowledged server receipt ends
 * retries without re-uploading, rewriting content or firing publication triggers.
 */
export async function publishListingSafely(options: {
  listingId: string | null;
  payload: SaveListingDraftPayload;
  onPrepared: (id: string) => void;
  persistAttributes: (id: string) => Promise<void>;
  persistPhotos: (id: string) => Promise<void>;
}): Promise<{ id: string; alreadyPublished: boolean }> {
  let id = options.listingId;
  if (!id) {
    const draft = await createListingDraft(options.payload);
    if (draft.error) throw new Error(draft.error.message);
    id = draft.data.id;
    options.onPrepared(id);
  }
  const prepared = await publicationRpc('prepare_listing_publication', id);
  options.onPrepared(id);
  if (prepared.already_published) return { id, alreadyPublished: true };
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Non connecté');
  const quota = await checkListingPublishDailyQuota(user.id);
  if (!quota.ok) throw new Error(quota.error.message);
  const saved = await updateListingDraft(id, options.payload);
  if (saved.error) throw new Error(saved.error.message);
  await options.persistAttributes(id);
  await options.persistPhotos(id);
  const finalized = await publicationRpc('finalize_listing_publication', id);
  if (finalized.status !== 'active') throw new Error('La publication doit être réessayée.');
  removeListingDetailSession(id);
  return { id, alreadyPublished: finalized.already_published };
}
