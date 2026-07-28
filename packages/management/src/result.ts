/**
 * Shared management result envelope used by CLI, MCP, and control API.
 */
export type ManagementResult<T = Record<string, unknown>> = Readonly<{
	ok: boolean;
	code: string;
	message: string;
	status?: string;
	remediation?: readonly string[];
	data?: T;
}>;

export function okResult<T>(
	message: string,
	data: T,
	opts?: { code?: string; status?: string },
): ManagementResult<T> {
	return Object.freeze({
		ok: true,
		code: opts?.code ?? "HOBO_OK",
		message,
		...(opts?.status !== undefined ? { status: opts.status } : {}),
		data,
	});
}

export function errResult(
	message: string,
	opts?: {
		code?: string;
		status?: string;
		remediation?: readonly string[];
		data?: Record<string, unknown>;
	},
): ManagementResult {
	return Object.freeze({
		ok: false,
		code: opts?.code ?? "HOBO_ERR",
		message,
		...(opts?.status !== undefined ? { status: opts.status } : {}),
		...(opts?.remediation !== undefined
			? { remediation: opts.remediation }
			: {}),
		...(opts?.data !== undefined ? { data: opts.data } : {}),
	});
}
