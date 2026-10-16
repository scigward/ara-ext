export const MINUTE = 60 * 1000
export const DAY = 24 * 60 * MINUTE

export interface Clock {
  left: () => number
  run: <T>(work: Promise<T>) => Promise<T>
}

// for when there's nothing to wait for
export const noClock: Clock = { left: () => Infinity, run: work => work }

// hayase kills a call after 10s without a word, so we stop first and hand back what we have
export function startClock (ms: number): Clock {
  const end = Date.now() + ms

  return {
    left: () => end - Date.now(),
    run (work) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('mirai took too long to answer')), Math.max(0, end - Date.now()))
        work.then(resolve, reject).finally(() => clearTimeout(timer))
      })
    }
  }
}
