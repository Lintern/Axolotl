#!/usr/bin/env node
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const [scriptName, ...args] = process.argv.slice(2)

if (!scriptName) {
	console.error('Usage: pnpm scripts <script-name> [args...]')
	console.error('Example: pnpm scripts coverage-i18n --verbose')
	process.exit(1)
}

const scriptPath = join(__dirname, `${scriptName}.ts`)

// Pass a single shell string so Node does not warn about unescaped args with shell:true.
const quote = (value) =>
	/[\s"%]/.test(value) ? `"${String(value).replace(/"/g, '\\"')}"` : String(value)
const command = ['pnpx', 'tsx', scriptPath, ...args].map(quote).join(' ')

const child = spawn(command, {
	stdio: 'inherit',
	shell: true,
})

child.on('exit', (code) => {
	process.exit(code ?? 0)
})
