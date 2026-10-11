// plain memory cache, dies with the worker

export interface Cache<V> {
  get: (key: string) => V | undefined
  set: (key: string, value: V, life?: number) => V
}

export function cache<V> (ms: number, max = 64): Cache<V> {
  const map = new Map<string, { value: V, until: number }>()

  return {
    get (key) {
      const hit = map.get(key)
      if (!hit) return undefined
      if (hit.until < Date.now()) {
        map.delete(key)
        return undefined
      }
      return hit.value
    },
    set (key, value, life = ms) {
      map.delete(key)
      map.set(key, { value, until: Date.now() + life })
      // oldest goes first, maps keep insertion order
      if (map.size > max) map.delete(map.keys().next().value!)
      return value
    }
  }
}
