# v0.1 Smoke Checklist

Run these before internal handoff.

## Local Verification

```bash
cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml
cargo test --manifest-path crates/gpuwatcher-helper/Cargo.toml
npm run test
npm run build
npm run electron:build
npm run helper:build
```

Expected result: all commands exit 0. These are non-live checks and must not depend on `tml-server`.

## Electron Dev Smoke

1. Run `npm run dev` and keep Vite listening at `http://127.0.0.1:5173`.
2. In a separate terminal, run `npm run electron:dev`.
3. Confirm the Electron window opens and desktop actions use the action-specific preload bridge.
4. Add or inspect a server entry against an isolated smoke DB when practical by setting `GPUWATCHER_TEST_DATA_DIR` before launch.
5. In a plain browser at `http://127.0.0.1:5173`, confirm backend-unavailable states don't cover the static app identity.
6. Confirm Settings actions that need a backend report backend unavailable in the plain browser rather than pretending to save.

Expected result: Electron is the normal desktop runtime, and the plain browser fallback degrades clearly.

## Unsigned Packaged App Smoke

1. Run `npm run electron:pack`.
2. Discover the generated app path with `APP_PATH="$(find release/electron -name 'GPUWatcher.app' -type d -print -quit)"`.
3. Confirm the helper is copied outside ASAR under app resources at `gpuwatcher-helper/gpuwatcher-helper`.
4. Confirm `test -n "$APP_PATH"` passes, then launch the app with `open "$APP_PATH"`.
5. Confirm the first window renders the app identity and navigation.
6. Confirm the app can locate and run the local helper, or reports a clear helper path/resource error.
7. Confirm the packaged macOS app is a local unsigned package with signing skipped, not a signed, notarized, DMG, uploaded, or release-ready artifact.
8. If macOS blocks launch because of Gatekeeper or quarantine, record that as an unsigned local package caveat rather than a product signing result.

Expected result: local packaging is usable for smoke checks only. Signing and notarization are outside this scope.

## SSH And First-Run GUI Caveats

Before testing a live server from the GUI, verify SSH in Terminal:

```bash
ssh -o BatchMode=yes USER@HOST true
```

Then verify the required base GPU query:

```bash
ssh -o BatchMode=yes USER@HOST 'nvidia-smi --query-gpu=index,name,uuid,driver_version,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits'
```

When launching the packaged GUI, also check these macOS app launch differences:

- `SSH_AUTH_SOCK` may not point to the same agent that Terminal uses.
- First-use `known_hosts` prompts won't work in noninteractive app refreshes.
- Passphrase prompts won't be shown by the app; unlock keys before launch.
- Shell startup files may not set the same `PATH`, so remote `nvidia-smi` must work in noninteractive SSH.

Expected result: key-based SSH and the base GPU CSV work without prompts.

## Live `tml-server` Smoke

Run this only when live SSH access is intended:

```bash
GPUWATCHER_LIVE_SSH_TARGET=tml-server cargo test --manifest-path crates/gpuwatcher-core/Cargo.toml live_tml_server -- --ignored --nocapture
```

Expected result: the ignored live test passes against `tml-server`, or the failure is a real live SSH/server issue. Normal tests must stay non-live.

## Remote Host Rule

Don't install GPUWatcher, nvitop, Python, collector packages, or repository files on the remote host. The remote requirements are only NVIDIA driver with `nvidia-smi`, a POSIX shell, `ps`, and key-based SSH from macOS.
