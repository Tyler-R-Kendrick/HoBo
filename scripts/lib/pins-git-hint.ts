/**
 * What to say when git failed because it could not ask the user something.
 *
 * Every network git the pins run is in its own session, so that its deadline
 * can end it with everything it started; it therefore has no controlling
 * terminal. ssh cannot ask for a passphrase or whether to trust a host key,
 * and git cannot ask for a username or a password (GIT_TERMINAL_PROMPT=0).
 *
 * Erasable TypeScript with node builtins only.
 */

const NEEDED_A_TERMINAL =
	/publickey|Permission denied|Host key verification failed|could not read Username/iu;

/** A hint line to append to a GIT_FAILED message, or "" when git's error is something else. */
export function terminalHint(stderr: string): string {
	if (!NEEDED_A_TERMINAL.test(stderr)) return "";
	return (
		"\nhint: pins run git without a terminal, so ssh cannot ask for a passphrase or a host key and git cannot ask for a username or password." +
		" Load the key into ssh-agent (ssh-add), add the host to ~/.ssh/known_hosts (connect once with ssh), or set up a git credential helper." +
		" The repositories in tools/pins/siblings.json are https; ssh is used only when your git config rewrites them (url.<base>.insteadOf)."
	);
}
