/**
 * Stub for @/integrations/orpc/client
 *
 * The resume store imports `orpc` for debounced server sync and `RouterOutput` as a type.
 * Since the PDF preview is read-only, we replace the real client with no-op stubs.
 */

// Deep proxy that returns itself for any property access, and no-op for function calls.
// Handles patterns like: orpc.resume.update.call(...)
const handler: ProxyHandler<object> = {
	get: (_target, _prop) => noopProxy,
	apply: () => Promise.resolve(),
}
const noopProxy: unknown = new Proxy(() => {}, handler)

export const orpc = noopProxy
export const client = noopProxy

export const getORPCClient = () => noopProxy

// biome-ignore lint/suspicious/noExplicitAny: stub types for standalone tool
export type RouterOutput = any
// biome-ignore lint/suspicious/noExplicitAny: stub types for standalone tool
export type RouterInput = any
