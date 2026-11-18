// Copies the API's OpenAPI document into src/shared/api/openapi.json, from which the client's types
// are generated. Source, in order: the PFM_OPENAPI environment variable (a path or URL), the API clone
// next to this one, or the document committed on the API repository's main branch.
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const sibling = path.resolve(root, '../personal-finance-manager-api/openapi/pfm-api.json')
const main = 'https://raw.githubusercontent.com/bienatviedoc/personal-finance-manager-api/main/openapi/pfm-api.json'

const source = process.env.PFM_OPENAPI ?? (existsSync(sibling) ? sibling : main)
const document = /^https?:/.test(source) ? await download(source) : await readFile(source, 'utf8')

// Re-serialise so formatting differences between sources never show up as drift.
await writeFile(path.join(root, 'src/shared/api/openapi.json'), JSON.stringify(JSON.parse(document), null, 2) + '\n')
console.log(`OpenAPI document copied from ${source}`)

async function download(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not download ${url}: ${response.status}`)
  return response.text()
}
