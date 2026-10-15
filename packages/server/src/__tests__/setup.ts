import dotenv from 'dotenv'
import path from 'path'

// Load .env from server package root
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

// Suppress console noise during tests
globalThis.console.warn = () => {}
globalThis.console.log = () => {}
