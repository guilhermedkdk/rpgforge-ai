'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { StepActionsIcon, StepActionsProps, StepActionsStatus } from './step-actions';

/** What a creation step publishes into the flow's single action bar. */
export interface StepActionsState {
  onBack?: () => void;
  onContinue?: () => void;
  canContinue?: boolean;
  loading?: boolean;
  backLabel?: string;
  continueLabel?: string;
  continueIcon?: StepActionsIcon;
  status?: StepActionsStatus | null;
}

type Handlers = Pick<StepActionsState, 'onBack' | 'onContinue'>;

// Everything that changes what the bar RENDERS. Handlers are deliberately not here: they live in a
// ref, reached through stable wrappers, so a step re-rendering with fresh inline arrows can neither
// re-render the bar nor loop by publishing a new identity every frame. That is what lets both call
// sites pass inline handlers without memoizing anything.
type StepActionsData = Omit<StepActionsState, 'onBack' | 'onContinue'> & {
  hasBack: boolean;
  hasContinue: boolean;
};

// `undefined` = nobody claimed the slot (the owner falls back to its own default for the step),
// `null` = the current step wants no bar at all.
type Published = StepActionsData | null | undefined;

interface Slot {
  handlers: { current: Handlers };
  publish: (data: Published) => void;
}

const StepActionsSlotContext = createContext<Slot | null>(null);

export const StepActionsSlotProvider = StepActionsSlotContext.Provider;

const toData = ({ onBack, onContinue, ...rest }: StepActionsState): StepActionsData => ({
  ...rest,
  hasBack: !!onBack,
  hasContinue: !!onContinue,
});

const sameStatus = (
  a: StepActionsStatus | null | undefined,
  b: StepActionsStatus | null | undefined
) => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind === 'error') return b.kind === 'error' && a.message === b.message;
  return b.kind === 'progress' && a.pending === b.pending;
};

const sameData = (a: Published, b: Published) => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.hasBack === b.hasBack &&
    a.hasContinue === b.hasContinue &&
    a.canContinue === b.canContinue &&
    a.loading === b.loading &&
    a.backLabel === b.backLabel &&
    a.continueLabel === b.continueLabel &&
    a.continueIcon === b.continueIcon &&
    sameStatus(a.status, b.status)
  );
};

/**
 * Owner side of the slot. Render `<StepActionsSlotProvider value={slot}>` around the steps and one
 * `<StepActions>` from `props`: `undefined` means no step claimed the bar (use your own default for
 * the current step), `null` means the step asked for no bar.
 */
export const useStepActionsSlot = () => {
  const handlers = useRef<Handlers>({});
  const [data, setData] = useState<Published>(undefined);

  const publish = useCallback((next: Published) => {
    setData((prev) => (sameData(prev, next) ? prev : next));
  }, []);

  const onBack = useCallback(() => handlers.current.onBack?.(), []);
  const onContinue = useCallback(() => handlers.current.onContinue?.(), []);
  const slot = useMemo<Slot>(() => ({ handlers, publish }), [publish]);

  const props = useMemo<StepActionsProps | null | undefined>(() => {
    if (!data) return data;
    const { hasBack, hasContinue, ...rest } = data;
    return {
      ...rest,
      onBack: hasBack ? onBack : undefined,
      onContinue: hasContinue ? onContinue : undefined,
    };
  }, [data, onBack, onContinue]);

  return { slot, props };
};

/**
 * Publishes this step's action bar. Pass `null` to hide the bar, or `undefined` when this step does
 * not own it (e.g. it delegates to a child that publishes its own). Handlers may be inline.
 */
export const useStepActions = (state: StepActionsState | null | undefined) => {
  const slot = useContext(StepActionsSlotContext);
  const claimed = useRef(false);

  // No dep array on purpose: the ref has to hold the latest handlers after every render, and
  // `publish` bails out when the values are unchanged, so this cannot loop.
  useEffect(() => {
    if (!slot) return;
    if (state === undefined) {
      // Release once, then stay out of the way: a delegating parent's effect runs AFTER the child's,
      // so re-publishing here on every render would wipe what the child just claimed.
      if (!claimed.current) return;
      claimed.current = false;
      slot.publish(undefined);
      return;
    }
    claimed.current = true;
    slot.handlers.current = state ? { onBack: state.onBack, onContinue: state.onContinue } : {};
    slot.publish(state && toData(state));
  });

  useEffect(
    () => () => {
      if (claimed.current) slot?.publish(undefined);
    },
    [slot]
  );
};
