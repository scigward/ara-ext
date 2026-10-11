export interface Clock {
  left: () => number
  run: <T>(work: Promise<T>) => Promise<T>
}

// hayase gives a call 10 seconds and drops it quietly after that, so we keep our own
// deadline and hand back what we have before the host pulls the plug
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
