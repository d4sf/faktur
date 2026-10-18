import { useCallback, useRef } from "react";

/**
 * Devuelve una versión "throttled" de `fn`: si se invoca antes de que pasen
 * `delay` ms desde la última invocación, se ignora. Útil para evitar doble
 * envío de formularios y clics rápidos en la navegación.
 */
export function useThrottle<T extends (...args: any[]) => any>(fn: T, delay: number): T {
  const lastCall = useRef(0);
  return useCallback(
    (...args: any[]) => {
      const now = Date.now();
      if (now - lastCall.current < delay) return;
      lastCall.current = now;
      return fn(...args);
    },
    [fn, delay],
  ) as T;
}