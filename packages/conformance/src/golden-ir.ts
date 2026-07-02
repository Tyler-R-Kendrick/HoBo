const languageSpecificGoldenIrKeys = new Set([
	"exceptionClass",
	"jsSyntax",
	"language",
	"runtime",
	"runtimeLanguage",
	"tsNodeKind",
	"typescriptNodeKind",
]);

export function findLanguageSpecificGoldenIrField(
	value: unknown,
	path = "$",
): { path: string } | null {
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index += 1) {
			const leak = findLanguageSpecificGoldenIrField(
				value[index],
				`${path}[${index}]`,
			);
			if (leak) {
				return leak;
			}
		}

		return null;
	}

	if (!isPlainObject(value)) {
		return null;
	}

	for (const key of Object.keys(value)) {
		const keyPath = joinPath(path, key);
		if (languageSpecificGoldenIrKeys.has(key)) {
			return { path: keyPath };
		}

		const leak = findLanguageSpecificGoldenIrField(value[key], keyPath);
		if (leak) {
			return leak;
		}
	}

	return null;
}

function joinPath(path: string, key: string): string {
	return /^[A-Za-z_$][\w$]*$/.test(key)
		? `${path}.${key}`
		: `${path}[${JSON.stringify(key)}]`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
