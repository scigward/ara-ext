import { handle } from './handler.ts'

export default {
  fetch: (request: Request) => handle(request, (input, init) => fetch(input, init))
}
