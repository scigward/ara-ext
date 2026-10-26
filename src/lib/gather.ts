export interface Gathered<T> {
  values: T[]
  errors: unknown[]
}

// waits for the tasks, but once one has something the rest get `grace` ms more.
// a slow zip shouldn't hold back the ones that are ready. values keep the tasks' order
export function gather<T> (tasks: Array<Promise<T[]>>, grace: number): Promise<Gathered<T>> {
  return new Promise(resolve => {
    const values: T[][] = []
    const errors: unknown[] = []
    let open = tasks.length
    let timer: ReturnType<typeof setTimeout> | undefined

    const done = () => {
      clearTimeout(timer)
      resolve({ values: values.flat(), errors })
    }
    if (!open) done()

    tasks.forEach((task, i) => {
      task
        .then(found => {
          values[i] = found
          if (found.length) timer ??= setTimeout(done, grace)
        }, (error: unknown) => { errors.push(error) })
        .finally(() => { if (!--open) done() })
    })
  })
}
