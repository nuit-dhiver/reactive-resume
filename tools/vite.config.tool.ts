/**
 * Minimal Vite config for the standalone JSON-to-PDF tool.
 *
 * Includes ONLY the plugins needed to render resume templates:
 *   - React (JSX transform)
 *   - Tailwind CSS v4 (styling)
 *   - Lingui (i18n macros used by components)
 *
 * Deliberately excludes: Nitro, TanStack Start/Router, PWA, database plugins.
 */

import { fileURLToPath } from "node:url"
import { lingui } from "@lingui/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
	root: fileURLToPath(new URL("preview", import.meta.url)),

	resolve: {
		alias: [
			// Stub out oRPC client FIRST (before @/ alias resolves it to real path)
			{
				find: "@/integrations/orpc/client",
				replacement: fileURLToPath(
					new URL("preview/stubs/orpc-client.ts", import.meta.url),
				),
			},
			// Stub out @tanstack/react-start (all subpaths) — not needed for preview
			{
				find: /^@tanstack\/react-start(\/.*)?$/,
				replacement: fileURLToPath(
					new URL("preview/stubs/tanstack-start.ts", import.meta.url),
				),
			},
			// Stub out locale utility (imports @tanstack/react-start)
			{
				find: "@/utils/locale",
				replacement: fileURLToPath(
					new URL("preview/stubs/locale.ts", import.meta.url),
				),
			},
			// Then map @/ to src/
			{
				find: "@/",
				replacement: fileURLToPath(new URL("../src/", import.meta.url)),
			},
		],
	},

	define: {
		__APP_VERSION__: JSON.stringify("0.0.0-tool"),
	},

	optimizeDeps: {
		exclude: [
			"@tanstack/react-start",
			"@tanstack/react-start/client",
			"@tanstack/react-start/server",
			"@tanstack/start-server-core",
		],
	},

	server: {
		host: "127.0.0.1",
		strictPort: true,
	},

	plugins: [
		lingui(),
		tailwindcss(),
		viteReact({ babel: { plugins: ["@lingui/babel-plugin-lingui-macro"] } }),
	],
})
