import { useCallback, useRef, useState } from 'react';

export function useHistory(size: number) {
  const [data, setData] = useState<number[]>([]);
  const ref = useRef<number[]>([]);

  const push = useCallback(
    (v: number) => {
      const arr = ref.current;
      if (arr.length < size) {
        arr.push(v);
      } else {
        arr.copyWithin(0, 1);
        arr[arr.length - 1] = v;
      }
      ref.current = arr;
      setData([...arr]);
    },
    [size]
  );

  const pushBatch = useCallback(
    (values: number[]) => {
      const arr = ref.current;
      for (const v of values) {
        if (arr.length < size) {
          arr.push(v);
        } else {
          arr.copyWithin(0, 1);
          arr[arr.length - 1] = v;
        }
      }
      ref.current = arr;
      setData([...arr]);
    },
    [size]
  );

  const reset = useCallback(() => {
    ref.current = [];
    setData([]);
  }, []);

  return { data, push, pushBatch, reset, hasData: data.length > 1 };
}
