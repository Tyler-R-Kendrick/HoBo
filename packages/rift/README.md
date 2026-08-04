# @hobo/rift — virtual worktrees that work on this machine

`hobo-rift` gives every agent its own copy-on-write checkout so parallel agents
cannot collide in a shared tree. It keeps [upstream rift](https://github.com/anomalyco/rift)'s
CLI shape (`init`, `create`, `list`, `remove`, `exec`) and is a drop-in for it.

## Why a sidecar rather than upstream

Upstream rift needs a filesystem with copy-on-write — btrfs, XFS with reflinks,
or APFS — and ships per-platform binaries. On the common case here, **ext4 on
linux-arm64**, it fails twice over: there is no binary for the platform, and
`cp --reflink=always` returns `Operation not supported`. `hobo-code mux` was
therefore silently degrading every agent to one shared checkout.

## The ladder

`hobo-rift` picks the best primitive the machine actually offers:

| Tier | How | Isolates in-place writes |
|---|---|---|
| `reflink` | `cp --reflink=always` (FICLONE) | yes |
| `overlayfs` | `unshare -Urm` + unprivileged overlay mount | yes |
| `hardlink` | `cp -al` | **no** |
| `copy` | `cp -a` | yes |

`hardlink` ranks below `overlayfs` deliberately: hardlinked files share inodes,
so an append or a `sed -i` in one workspace **reaches the source**. It is kept
only as a last resort before a full copy, and `capability` reports the hazard
rather than presenting all tiers as equivalent.

Regenerable bulk (`node_modules`, `.venv`, build output) is excluded from a
clone unless you pass `--copy-all`.

## Entering a workspace

Directory-backed tiers are ordinary paths — `cd` into them. The overlay tier is
mounted **inside a user namespace**, so its merged path does not exist to
anyone outside that namespace and `cd` would find an empty directory. Run
commands through the wrapper instead:

```sh
hobo-rift exec --name claude -- claude          # run it
hobo-rift exec --name claude --print-cmd -- claude   # print the wrapped command
```

`hobo-code mux` uses `--print-cmd` to build its tmux pane commands, which is why
panes land in a real isolated tree rather than an empty directory.

## Usage

```sh
hobo-rift capability            # which primitive is available here, and why
hobo-rift init                  # register the current directory as a source root
hobo-rift create --name claude  # prints the workspace path on stdout
hobo-rift list --json
hobo-rift remove --name claude
```
