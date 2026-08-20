import { useCallback, useRef, useState } from 'react';

export function useHistory(size: number) {
  const [data, setData] = useState<number[]>([]);
  const ref = useRef<number[]>([]);

  const push = useCallback(
    (v: number) => {
      const next = [...ref.current, v].slice(-size);
      ref.current = next;
      setData(next);
    },
    [size]
  );

  const pushBatch = useCallback(
    (values: number[]) => {
      let next = ref.current;
      for (const v of values) next = [...next, v];
      next = next.slice(-size);
      ref.current = next;
      setData(next);
    },
    [size]
  );

  const reset = useCallback(() => {
    ref.current = [];
    setData([]);
  }, []);

  return { data, push, pushBatch, reset, hasData: data.length > 1 };
}
