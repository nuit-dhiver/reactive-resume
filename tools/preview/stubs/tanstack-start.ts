/**
 * Stub for @tanstack/react-start
 *
 * Prevents Vite from trying to resolve TanStack Start internals
 * (which require import maps like #tanstack-start-entry).
 * The preview tool doesn't use routing or SSR.
 */

// biome-ignore lint/suspicious/noExplicitAny: stub for standalone tool
export const createIsomorphicFn = () => ({
	server: (fn: unknown) => ({ client: (fn2: unknown) => fn2 }),
	client: (fn: unknown) => fn,
})

// biome-ignore lint/suspicious/noExplicitAny: stub for standalone tool
export const createServerFn = (..._args: any[]) => ({
	inputValidator: () => ({ handler: () => {} }),
})
