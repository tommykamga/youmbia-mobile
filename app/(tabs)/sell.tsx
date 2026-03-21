import React, { useCallback, useState } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { getSession } from '@/services/auth';
import { AuthGate, Loader } from '@/components';

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
  if (status === 'unauthenticated') return <AuthGate context="sell" />;

  // Render nothing while pushing to /sell
  return null;
}
