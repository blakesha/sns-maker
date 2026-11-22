// Production server: serves dist/ and the same /api + /local-assets endpoints as the Vite dev plugin.
// No dependencies. Data lives in DATA_DIR (data/) and ASSETS_DIR (local-assets/), mounted as volumes.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const DIST = path.resolve(process.env.DIST_DIR ?? 'dist')
const DATA = path.resolve(process.env.DATA_DIR ?? 'data')
const ASSETS = path.resolve(process.env.ASSETS_DIR ?? 'local-assets')
const PORT = Number(process.env.PORT ?? 8080)
const MAX = 300 * 1024 * 1024

const STORES = {
  library: path.join(ASSETS, 'user-library.json'),
  campaigns: path.join(DATA, 'campaigns.json'),
  play: path.join(DATA, 'play.json'),
}
const PACKS = ['sns-quest-editor-tiles.json', 'sns-quest-editor-markers.json', 'sns-quest-editor-art.json', 'sns-companion-cards.json']
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }

const send = (res, code, body = '', type) => {
  if (type) res.setHeader('Content-Type', type)
  res.statusCode = code
  res.end(body)
}

function handleStore(req, res, name) {
  const abs = STORES[name]
  if (!abs) return send(res, 404)
  if (req.method === 'GET') {
    if (!fs.existsSync(abs)) return send(res, 404)
    res.setHeader('Content-Type', 'application/json')
    return void fs.createReadStream(abs).pipe(res)
  }
  if (req.method !== 'PUT') return send(res, 405)
  const chunks = []
  let size = 0
  req.on('data', (c) => {
    size += c.length
    if (size > MAX) req.destroy()
    else chunks.push(c)
  })
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8')
    try {
      JSON.parse(body)
    } catch {
      return send(res, 400, 'invalid JSON')
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs + '.tmp', body)
    fs.renameSync(abs + '.tmp', abs)
    send(res, 204)
  })
}

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0])
    if (url.startsWith('/api/store/')) return handleStore(req, res, url.slice('/api/store/'.length))
    if (url === '/api/packs') {
      const list = PACKS.flatMap((f) => {
        const abs = path.join(ASSETS, f)
        return fs.existsSync(abs) ? [{ file: f, mtime: fs.statSync(abs).mtimeMs }] : []
      })
      return send(res, 200, JSON.stringify(list), 'application/json')
    }
    if (url.startsWith('/local-assets/')) {
      const f = url.slice('/local-assets/'.length)
      if (!PACKS.includes(f) || !fs.existsSync(path.join(ASSETS, f))) return send(res, 404)
      res.setHeader('Content-Type', 'application/json')
      return void fs.createReadStream(path.join(ASSETS, f)).pipe(res)
    }
    // static files, falling back to index.html
    let file = path.join(DIST, url)
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
    res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream')
    fs.createReadStream(file).pipe(res)
  })
  .listen(PORT, '0.0.0.0', () => console.log(`Quest Forge on :${PORT}`))
process.on('SIGTERM', () => process.exit(0))
