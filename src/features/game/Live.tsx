'use client';
import type { JSX } from 'react';
import type { MemberView } from '@/core';
import type { useGame } from '@/lib/useGame';

export function Live(props: { game: MemberView; act: ReturnType<typeof useGame>['act']; serverNow: () => number }): JSX.Element {
  void props;
  return <div />;
}
