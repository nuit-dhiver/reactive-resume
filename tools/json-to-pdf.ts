/**
 * Standalone JSON-to-PDF Tool for Reactive Resume
 *
 * Generates PDF files from Reactive Resume JSON data without running the full application.
 * Uses the project's existing React templates rendered via a lightweight Vite dev server + Puppeteer.
 *
 * Usage:
 *   pnpm tool:pdf <input.json> [output.pdf] [--template=onyx] [--format=a4]
 *
 * Requirements:
 *   - Chrome/Chromium installed on your system (auto-detected), OR
 *     set CHROME_PATH env var, OR set PRINTER_ENDPOINT for remote Browserless
 *   - pnpm install (project dependencies)
 *
 * The input JSON must conform to the ResumeData schema (see src/schema/resume/data.ts).
 * Use tools/sample-resume.json as a reference.
 */

/// <reference types="node" />

import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, "..")

// Page dimensions matching the project's schema (src/schema/page.ts)
const PAGE_DIMENSIONS = {
	a4: { width: 794, height: 1123 },
	letter: { width: 816, height: 1056 },
	"free-form": { width: 794, height: 1123 },
} as const

// Templates that need PDF-level margins (src/schema/templates.ts)
const PRINT_MARGIN_TEMPLATES = [
	"azurill",
	"bronzor",
	"kakuna",
	"lapras",
	"onyx",
	"pikachu",
	"rhyhorn",
]

const VALID_TEMPLATES = [
	"azurill", "bronzor", "chikorita", "ditgar", "ditto",
	"gengar", "glalie", "kakuna", "lapras", "leafish",
	"onyx", "pikachu", "rhyhorn",
]

const VALID_FORMATS = ["a4", "letter", "free-form"]

// ---------------------------------------------------------------------------
// System Chrome/Chromium detection
// ---------------------------------------------------------------------------

function findSystemChrome(): string | null {
	// 1. Explicit env var
	if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
		return process.env.CHROME_PATH
	}

	const candidates: string[] = []

	if (process.platform === "darwin") {
		candidates.push(
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
			"/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
			"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
		)
	} else if (process.platform === "linux") {
		candidates.push(
			"/usr/bin/google-chrome",
			"/usr/bin/google-chrome-stable",
			"/usr/bin/chromium",
			"/usr/bin/chromium-browser",
			"/snap/bin/chromium",
		)
	} else if (process.platform === "win32") {
		const programFiles = process.env["PROGRAMFILES"] ?? "C:\\Program Files"
		const programFilesX86 = process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)"
		const localAppData = process.env.LOCALAPPDATA ?? ""
		candidates.push(
			`${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
			`${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
			`${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
			`${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
		)
	}

	return candidates.find((p) => existsSync(p)) ?? null
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function printUsage() {
	console.log(`
Reactive Resume — JSON to PDF Tool

Usage:
  pnpm tool:pdf <input.json> [output.pdf] [options]

Options:
  --template=<name>   Override the template (default: from JSON or "onyx")
                      Templates: ${VALID_TEMPLATES.join(", ")}
  --format=<format>   Override the page format (default: from JSON or "a4")
                      Formats: ${VALID_FORMATS.join(", ")}
  --help              Show this help message

Environment:
  CHROME_PATH         Path to Chrome/Chromium executable (auto-detected if unset)
  PRINTER_ENDPOINT    WebSocket URL for remote Browserless instance
                      (e.g. ws://localhost:4000?token=1234567890)

Examples:
  pnpm tool:pdf resume.json
  pnpm tool:pdf resume.json output.pdf --template=chikorita
  pnpm tool:pdf resume.json --format=letter --template=bronzor
`)
}

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		template: { type: "string" },
		format: { type: "string" },
		help: { type: "boolean", default: false },
	},
})

if (values.help || positionals.length === 0) {
	printUsage()
	process.exit(values.help ? 0 : 1)
}

const inputPath = resolve(positionals[0])
const outputPath = resolve(positionals[1] ?? positionals[0].replace(/\.json$/i, ".pdf"))

// Validate CLI options
if (values.template && !VALID_TEMPLATES.includes(values.template)) {
	console.error(`Error: Invalid template "${values.template}". Valid: ${VALID_TEMPLATES.join(", ")}`)
	process.exit(1)
}
if (values.format && !VALID_FORMATS.includes(values.format)) {
	console.error(`Error: Invalid format "${values.format}". Valid: ${VALID_FORMATS.join(", ")}`)
	process.exit(1)
}

// ---------------------------------------------------------------------------
// Read and validate JSON
// ---------------------------------------------------------------------------

console.log(`Reading: ${inputPath}`)

let resumeData: Record<string, unknown>
try {
	const raw = readFileSync(inputPath, "utf-8")
	resumeData = JSON.parse(raw)
} catch (err) {
	console.error(`Error: Failed to read or parse "${inputPath}"`)
	console.error((err as Error).message)
	process.exit(1)
}

// Apply CLI overrides to metadata
const metadata = resumeData.metadata as Record<string, unknown> | undefined
if (metadata) {
	if (values.template) {
		metadata.template = values.template
	}
	if (values.format) {
		const page = metadata.page as Record<string, unknown> | undefined
		if (page) page.format = values.format
	}
}

// Resolve effective settings
const template = String((metadata as Record<string, unknown>)?.template ?? "onyx")
const pageSettings = (metadata as Record<string, unknown>)?.page as Record<string, unknown> | undefined
const format = String(pageSettings?.format ?? "a4") as keyof typeof PAGE_DIMENSIONS

console.log(`Template: ${template}, Format: ${format}`)

// ---------------------------------------------------------------------------
// Start a lightweight Vite dev server (tools/vite.config.tool.ts — no Nitro)
// ---------------------------------------------------------------------------

function startViteServer(port: number): Promise<{ child: ChildProcess; url: string }> {
	return new Promise((resolvePromise, reject) => {
		const viteConfigPath = resolve(__dirname, "vite.config.tool.ts")
		const viteBin = resolve(projectRoot, "node_modules", ".bin", "vite")

		// Run vite directly from node_modules/.bin (avoid pnpm PATH issues)
		const child = spawn(
			viteBin,
			["dev", "--config", viteConfigPath, "--port", String(port)],
			{
				cwd: projectRoot,
				stdio: ["ignore", "pipe", "pipe"] as const,
				env: {
					...process.env,
				} as NodeJS.ProcessEnv,
			},
		)

		let output = ""
		const timeout = setTimeout(() => {
			reject(new Error("Vite dev server failed to start within 60 seconds"))
		}, 60_000)

		child.stdout.on("data", (data: Buffer) => {
			output += data.toString()
			// Vite prints the local URL when ready
			const match = output.match(/https?:\/\/[^\s]+?:\d+/)
			if (match) {
				clearTimeout(timeout)
				resolvePromise({ child, url: match[0].replace(/['"]/g, "") })
			}
		})

		child.stderr.on("data", (data: Buffer) => {
			output += data.toString()
		})

		child.on("error", (err: Error) => {
			clearTimeout(timeout)
			reject(err)
		})

		child.on("exit", (code: number | null) => {
			if (code !== null && code !== 0) {
				clearTimeout(timeout)
				reject(new Error(`Vite dev server exited with code ${code}\n${output}`))
			}
		})
	})
}

// ---------------------------------------------------------------------------
// Wait for server to be reachable (Vite may log URL before it's ready)
// ---------------------------------------------------------------------------

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
	const start = Date.now()
	while (Date.now() - start < timeoutMs) {
		try {
			await fetch(url, { signal: AbortSignal.timeout(2000) })
			return
		} catch {
			await new Promise((r) => setTimeout(r, 300))
		}
	}
	throw new Error(`Server at ${url} not reachable after ${timeoutMs}ms`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const port = 15173 + Math.floor(Math.random() * 1000) // Random port to avoid conflicts

	console.log("Starting Vite dev server...")
	const { child: viteChild, url: serverUrl } = await startViteServer(port)
	console.log(`Vite server running at ${serverUrl}`)

	// Wait for the server to be reachable (Vite may print URL before ready)
	await waitForServer(serverUrl, 15_000)

	// -----------------------------------------------------------------------
	// Launch Puppeteer (uses puppeteer-core + system Chrome)
	// -----------------------------------------------------------------------

	// Dynamic import of puppeteer-core
	// biome-ignore lint/suspicious/noExplicitAny: standalone CLI tool
	const puppeteerCore = (await import("puppeteer-core")) as any
	const puppeteer = puppeteerCore.default ?? puppeteerCore
	// biome-ignore lint/suspicious/noExplicitAny: standalone CLI tool
	let browser: any

	const printerEndpoint = process.env.PRINTER_ENDPOINT
	if (printerEndpoint) {
		// Connect to external Browserless / headless Chrome
		console.log(`Connecting to browser at ${printerEndpoint}...`)
		const endpoint = new URL(printerEndpoint)
		const isWebSocket = endpoint.protocol.startsWith("ws")
		const args = ["--disable-dev-shm-usage", "--disable-features=LocalNetworkAccessChecks,site-per-process,FedCm"]
		endpoint.searchParams.append("launch", JSON.stringify({ args }))
		const connectOptions = { acceptInsecureCerts: true } as Record<string, unknown>
		if (isWebSocket) connectOptions.browserWSEndpoint = endpoint.toString()
		else connectOptions.browserURL = endpoint.toString()
		browser = await puppeteer.connect(connectOptions)
	} else {
		// Launch local system Chrome/Chromium via puppeteer-core
		const chromePath = findSystemChrome()
		if (!chromePath) {
			console.error(
				"Error: Could not find Chrome/Chromium on your system.\n" +
				"Options:\n" +
				"  1. Install Google Chrome or Chromium\n" +
				"  2. Set CHROME_PATH env var to your Chrome/Chromium executable\n" +
				"  3. Set PRINTER_ENDPOINT to a Browserless instance\n" +
				"     (e.g. PRINTER_ENDPOINT=ws://localhost:4000?token=1234567890)\n" +
				"     Start one with: docker run -p 4000:3000 ghcr.io/browserless/chromium"
			)
			viteChild.kill()
			process.exit(1)
		}
		console.log(`Launching Chrome: ${chromePath}`)
		browser = await puppeteer.launch({
			headless: true,
			executablePath: chromePath,
			args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-setuid-sandbox"],
		})
	}

	try {
		const page = await browser.newPage()

		// Inject resume data into the page before navigation
		await page.evaluateOnNewDocument((data: string) => {
			;(window as unknown as { __RESUME_DATA__: unknown }).__RESUME_DATA__ = JSON.parse(data)
		}, JSON.stringify(resumeData))

		// Set viewport to match page format
		const dimensions = PAGE_DIMENSIONS[format] ?? PAGE_DIMENSIONS.a4
		await page.setViewport(dimensions)

		// Navigate to the preview page (served at root by our tool Vite config)
		console.log("Loading preview...")
		await page.goto(serverUrl, { waitUntil: "networkidle0", timeout: 60_000 })

		// Wait for fonts to load (the useWebfonts hook sets this attribute)
		try {
			await page.waitForFunction(
				() => document.body.getAttribute("data-wf-loaded") === "true",
				{ timeout: 10_000 },
			)
		} catch {
			console.warn("Warning: Font loading signal not detected, proceeding anyway...")
		}

		// -----------------------------------------------------------------------
		// DOM manipulation for PDF pagination (mirrors printer.ts logic)
		// -----------------------------------------------------------------------

		let marginX = 0
		let marginY = 0

		if (PRINT_MARGIN_TEMPLATES.includes(template)) {
			marginX = Math.round(Number(pageSettings?.marginX ?? 14) / 0.75)
			marginY = Math.round(Number(pageSettings?.marginY ?? 12) / 0.75)
		}

		const isFreeForm = format === "free-form"

		const contentHeight = await page.evaluate(
			(marginY: number, isFreeForm: boolean, minPageHeight: number) => {
				const root = document.documentElement
				const pageElements = document.querySelectorAll("[data-page-index]")
				const container = document.querySelector(".resume-preview-container") as HTMLElement | null

				if (isFreeForm) {
					const marginYAsPixels = marginY * 0.75
					const numberOfPages = pageElements.length
					for (let i = 0; i < numberOfPages - 1; i++) {
						;(pageElements[i] as HTMLElement).style.marginBottom = `${marginYAsPixels}px`
					}
					let totalHeight = 0
					for (const el of pageElements) {
						const pageEl = el as HTMLElement
						const style = getComputedStyle(pageEl)
						const marginBottom = Number.parseFloat(style.marginBottom) || 0
						totalHeight += pageEl.offsetHeight + marginBottom
					}
					return Math.max(totalHeight, minPageHeight)
				}

				// A4/Letter: adjust page height for margins + add page breaks
				const rootHeight = getComputedStyle(root).getPropertyValue("--page-height").trim()
				const containerHeight = container
					? getComputedStyle(container).getPropertyValue("--page-height").trim()
					: null
				const currentHeight = containerHeight || rootHeight
				const heightValue = Math.max(Number.parseFloat(currentHeight), minPageHeight)

				if (!Number.isNaN(heightValue)) {
					const newHeight = `${heightValue - marginY}px`
					if (container) container.style.setProperty("--page-height", newHeight)
					root.style.setProperty("--page-height", newHeight)
				}

				for (const el of pageElements) {
					const element = el as HTMLElement
					const index = Number.parseInt(element.getAttribute("data-page-index") ?? "0", 10)
					if (index > 0) element.style.breakBefore = "page"
					element.style.breakInside = "auto"
				}

				return null
			},
			marginY,
			isFreeForm,
			dimensions.height,
		)

		// -----------------------------------------------------------------------
		// Generate PDF
		// -----------------------------------------------------------------------

		const pdfHeight = isFreeForm && contentHeight ? contentHeight : dimensions.height

		console.log("Generating PDF...")
		const pdfBuffer = await page.pdf({
			width: `${dimensions.width}px`,
			height: `${pdfHeight}px`,
			tagged: true,
			waitForFonts: true,
			printBackground: true,
			margin: {
				bottom: 0,
				top: marginY,
				right: marginX,
				left: marginX,
			},
		})

		await page.close()

		// Write PDF to disk
		writeFileSync(outputPath, pdfBuffer)
		console.log(`\nPDF saved to: ${outputPath}`)
	} finally {
		await browser.close()
		viteChild.kill()
	}
}

main().catch((err) => {
	console.error("Fatal error:", err)
	process.exit(1)
})
