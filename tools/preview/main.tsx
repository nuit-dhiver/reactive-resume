/**
 * Standalone React entry point for resume PDF preview.
 * Bypasses TanStack Router/Start — renders ResumePreview directly.
 */

import { i18n } from "@lingui/core"
import { I18nProvider } from "@lingui/react"
import { useEffect } from "react"
import { createRoot } from "react-dom/client"

// Import the project's global styles (Tailwind, design tokens, etc.)
import "@/styles/globals.css"

import { LoadingScreen } from "@/components/layout/loading-screen"
import { ResumePreview } from "@/components/resume/preview"
import { useResumeStore } from "@/components/resume/store/resume"
import type { ResumeData } from "@/schema/resume/data"

declare global {
	interface Window {
		__RESUME_DATA__?: ResumeData
	}
}

// Load English locale for Lingui (minimal — just enough for component text)
async function setupLocale() {
	const { messages } = (await import("../../locales/en-US.po")) as { messages: Record<string, string> }
	i18n.loadAndActivate({ locale: "en-US", messages })
}

function App() {
	const isReady = useResumeStore((state) => state.isReady)
	const initialize = useResumeStore((state) => state.initialize)

	useEffect(() => {
		const data = window.__RESUME_DATA__
		if (!data) return

		// Create a minimal Resume object from injected data
		const resume = {
			id: "preview",
			name: "Preview",
			slug: "preview",
			tags: [] as string[],
			data,
			isLocked: false,
		}

		initialize(resume)
		return () => initialize(null)
	}, [initialize])

	if (!isReady) return <LoadingScreen />
	return <ResumePreview pageClassName="print:w-full!" />
}

// Bootstrap: load locale, then render
setupLocale().then(() => {
	const container = document.getElementById("root")
	if (!container) throw new Error("Root element not found")

	createRoot(container).render(
		<I18nProvider i18n={i18n}>
			<App />
		</I18nProvider>,
	)
})
