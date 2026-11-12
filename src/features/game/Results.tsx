'use client';
import type { JSX } from 'react';
import type { MemberView } from '@/core';
import type { useGame } from '@/lib/useGame';

export function Results(props: { game: MemberView; act: ReturnType<typeof useGame>['act'] }): JSX.Element {
  void props;
  return <div />;
}
