import { supabase } from '@/lib/supabase';

export async function getFavoritePushPreference(): Promise<boolean> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Connexion requise');
  const { data, error } = await supabase.from('transactional_push_preferences')
    .select('favorites_enabled').eq('user_id', user.id).maybeSingle();
  if (error) throw new Error('Préférence de notifications indisponible');
  return data?.favorites_enabled !== false;
}

export async function setFavoritePushPreference(enabled: boolean): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Connexion requise');
  const { error } = await supabase.from('transactional_push_preferences')
    .upsert({ user_id: user.id, favorites_enabled: enabled }, { onConflict: 'user_id' });
  if (error) throw new Error('Impossible de modifier les notifications de favoris');
}
