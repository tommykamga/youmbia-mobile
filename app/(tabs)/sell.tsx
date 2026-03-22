import React, { useCallback, useState } from 'react';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';
import { getSession } from '@/services/auth';
import { Loader } from '@/components';
import { buildAuthGateHref } from '@/lib/authGateNavigation';

export default function SellTabScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'unauthenticated' | 'authenticated'>('loading');

  useFocusEffect(
    useCallback(() => {
      async function checkAuth() {
        const session = await getSession();
        if (!session?.user) {
          setStatus('unauthenticated');
        } else {
          setStatus('authenticated');
          router.push('/sell');
        }
      }
      checkAuth();
    }, [router])
  );

  if (status === 'loading') return <Loader />;
  if (status === 'unauthenticated') return <Redirect href={buildAuthGateHref('sell')} />;

  // Render nothing while pushing to /sell
  return null;
}
