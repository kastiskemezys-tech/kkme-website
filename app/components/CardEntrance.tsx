'use client';

import { useEffect } from 'react';
import { animateCards } from '@/lib/animations';

export function CardEntrance() {
  useEffect(() => {
    animateCards('.signal-card');
  }, []);
  return null;
}
