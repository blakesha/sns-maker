import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Dev-server storage: keeps the tile library, campaigns and play state as files in the project
 * so they survive browser data being cleared. Only active under `npm run dev` (bound to localhost).
 *
 *   GET/PUT /api/store/<name>   read / write one of the files below
 *   GET     /api/packs          list extracted asset packs in local-assets/
 *   GET     /local-assets/<f>   download one of those packs
 */
function localStore(): Plugin {
  const root = process.cwd()
  const STORES: Record<string, string> = {
    library: 'local-assets/user-library.json', // your tiles, images, releases (may contain game art: gitignored)
    campaigns: 'data/campaigns.json',
    play: 'data/play.json',
  }
  const PACKS = ['sns-quest-editor-tiles.json', 'sns-quest-editor-markers.json', 'sns-quest-editor-art.json']
  const MAX = 300 * 1024 * 1024

  return {
    name: 'quest-forge-local-store',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/store', (req, res) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0]
        const rel = STORES[name]
        if (!rel) return void ((res.statusCode = 404), res.end())
        const abs = path.join(root, rel)
        if (req.method === 'GET') {
          if (!fs.existsSync(abs)) return void ((res.statusCode = 404), res.end())
          res.setHeader('Content-Type', 'application/json')
          return void fs.createReadStream(abs).pipe(res)
        }
        if (req.method === 'PUT') {
          const chunks: Buffer[] = []
          let size = 0
          req.on('data', (c: Buffer) => {
            size += c.length
            if (size > MAX) req.destroy()
            else chunks.push(c)
          })
          req.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8')
            try {
              JSON.parse(body)
            } catch {
              return void ((res.statusCode = 400), res.end('invalid JSON'))
            }
            fs.mkdirSync(path.dirname(abs), { recursive: true })
            // write then rename so a crash never leaves a half-written file
            fs.writeFileSync(abs + '.tmp', body)
            fs.renameSync(abs + '.tmp', abs)
            res.statusCode = 204
            res.end()
          })
          return
        }
        res.statusCode = 405
        res.end()
      })

      server.middlewares.use('/api/packs', (_req, res) => {
        const list = PACKS.flatMap((f) => {
          const abs = path.join(root, 'local-assets', f)
          return fs.existsSync(abs) ? [{ file: f, mtime: fs.statSync(abs).mtimeMs }] : []
        })
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(list))
      })

      server.middlewares.use('/local-assets', (req, res, next) => {
        const f = (req.url ?? '').replace(/^\//, '').split('?')[0]
        if (!PACKS.includes(f)) return next()
        res.setHeader('Content-Type', 'application/json')
        fs.createReadStream(path.join(root, 'local-assets', f)).pipe(res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localStore()],
})
