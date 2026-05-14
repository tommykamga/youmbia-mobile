import React, { useCallback, useState } from 'react';
import { useRouter, useFocusEffect, Redirect, type Href } from 'expo-router';
import { getSession } from '@/services/auth';
import { Loader } from '@/components';
import { buildAuthGateHref } from '@/lib/authGateNavigation';

export default function SellTabScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'unauthenticated' | 'authenticated'>('loading');

  useFocusEffect(
    useCallback(() => {
      async function checkAuthAndRoute() {
        const session = await getSession();
        if (!session?.user) {
          setStatus('unauthenticated');
          return;
        }

        setStatus('authenticated');
        router.replace('/sell' as Href);
      }
      void checkAuthAndRoute();
    }, [router])
  );

  if (status === 'loading') return <Loader />;
  if (status === 'unauthenticated') return <Redirect href={buildAuthGateHref('sell')} />;

  return null;
}
