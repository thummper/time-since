import { serve } from '@hono/node-server'
import { createApp } from './app.ts'

const port = Number(process.env.PORT ?? 3000)
const app = createApp()

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`time-since listening on http://localhost:${info.port}`)
})
