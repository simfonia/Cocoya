# Multi-window Serial Phase 2 — Handoff (2026-10-07)

## Pause point

The user asked to pause implementation and preserve progress for the next session. Do not treat Phase 2 as complete. The working tree contains a partial implementation with mixed staged/unstaged changes; do not reset or re-stage files without asking.

## Confirmed product scope / decisions

- Windows Tauri multi-window only. VSIX has no multi-window issue and receives no Hub feature or Hub E2E; preserve its native pyserial path through the generator fallback. POSIX is deferred.
- The PC Serial blocks auto-start or join a per-port Hub regardless of whether monitor/upload was started first.
- Hub owns the physical COM handle. Any number of monitor/read clients can subscribe; one PC client at a time can acquire the writer lease, which is acquired lazily on first `write()` rather than just opening a read client.
- Upload asks the Hub for an exclusive lease. If a writer already owns the lease, deployment must fail before stopping existing Python/monitor work and show an actionable message. Do not preempt or kill another window/external serial process. Read-only monitor clients pause while upload owns the port and resume after lease release.
- RX fan-out is data-only: Hub monitor subscribers each get the MCU data in their own Tauri terminal via `emit_to`; PC proxy RX is only returned to that Python process. Python stdout remains routed to the launching window.
- Monitor session active is distinct from physical COM connected. Existing Phase 1 unplug/replug test was confirmed by the user to reconnect on the same COM name. Other Phase 1 manual checks are deferred until Phase 2 is complete.

## Current partial implementation

### Python Hub / proxy
- New `resources/deploy/serial_hub.py`: loopback TCP server, per-port metadata/token in temp state, process lock, JSON-line protocol with base64 RX/TX, monitor/read subscriptions, lazy single-writer lease, upload lease, per-client bounded sender queues, 1 MiB client RX cap, daemon idle timeout, and pyserial-shaped `SerialProxy` API (`write`, `read`, `readline`, `in_waiting`, `reset_input_buffer`, `timeout`, `write_timeout`).
- New `tests/e2e/test_serial_hub.py`: fake serial-backed Hub tests for two readers/fan-out, writer conflict, upload pause/rejection/release, and client-local input reset.
- `resources/deploy/base.py`: Tauri monitor branch closes the deployer's direct pyserial handle, releases any same-process CLI lease, and attaches as a monitor subscriber. Connection markers track Hub physical connection state. Monitor keeps retrying through transient upload lease contention.
- `resources/deploy_mcu.py`: standalone Tauri mode can request a Python-managed upload lease; Rust-managed deploy skips the duplicate lease using `COCOYA_SERIAL_HUB_EXTERNAL_UPLOAD_LEASE`.

### Tauri integration
- `src-tauri/src/commands/python.rs::run_python` sets `COCOYA_SERIAL_HUB_ENABLED` and `COCOYA_SERIAL_HUB_SCRIPT`; this is inert for generated code without the PC Serial init block.
- `ui/src/modules/core/io/io_generators.js`: PC generated code chooses `SerialProxy` only when the Tauri Hub env flag is present, otherwise keeps native pyserial for VSIX/other hosts. MicroPython code path remains unchanged.
- `src-tauri/src/commands/mcu/deploy.rs`: spawns `serial_hub.py --lease <port> 115200`, waits for a ready/error line before stopping the current window process, returns conflict errors through invoke, releases the helper lease after monitor-active marker or deploy stdout EOF.
- `src-tauri/src/commands/mcu/monitor.rs`: Hub monitor subprocess has Hub env; removed same-port monitor stealing; blur no longer releases subscriptions, focus can retry missing sessions.
- Tauri resources already bundle the whole `resources/deploy/` directory, so `serial_hub.py` should be included without a new resource mapping; verify release packaging.
- `pyrightconfig.json` adds `resources` to `extraPaths` so `tests/e2e` can resolve `deploy` imports.

## Verification observed so far

- Hub tests last ran `pytest tests/e2e/test_serial_hub.py -q` and showed three passing tests, but this was before the latest Optional/socket narrowing and writer-lazy-acquire edits. **Rerun before relying on that result.**
- Generator/Phase 1 selected Node tests passed before the last test edits; rerun.
- `cargo check` passed before the most recent monitor EOF cleanup and later Hub lease refinements; rerun.
- The full Rust test invocation was started, but its output did not return a final summary before pause. Treat final full Rust test status as unverified.
- Do not claim MSI/package startup, actual hardware multi-window behavior, unplug/replug during Hub ownership, or upload contention has been tested.

## Next session sequence

1. Inspect this handoff and `log/plan/MultiWindowSerialSharing.md`; check `git status` and preserve both staged/unstaged deltas.
2. Run `get_errors`/Pylance diagnostics for `resources/deploy/serial_hub.py` and `tests/e2e/test_serial_hub.py`; latest patch added `resources` to pyright extraPaths and narrowed optional socket results.
3. Run, in order: Hub pytest; `py_compile` for changed Python; `npm run test:fast`; `npm run lint:ui`; `npm run test:rust`; `cargo check`; UI build; `npm run eol:check` and `git diff --check`.
4. Fix failures before more feature work. Add tests for first-client auto-start, server startup races/stale metadata, baud mismatch, Hub/client crash, buffer overflow, and lease-helper ready/error handling.
5. Review the implementation for these risks before calling Phase 2 implemented:
   - `_start_hub` concurrent-start/stale metadata handling and subprocess lifecycle.
   - Upload lease release if Tauri deploy command fails at every point after acquisition; ensure no leaked lease helper.
   - `SerialProxy.write()` uses an asynchronous physical write after synchronous writer-lease acquisition; verify error behavior is acceptable for the block API and `write_timeout=0` contract.
   - Hub server reader loop, bounded queues, slow subscriber eviction, DTR/RTS and COM unplug/reconnect behavior.
   - Verify the monitor subscription doesn't print Hub control JSON or PC RX into unrelated terminal output.
   - Confirm Tauri packaged Resource path resolves `resources/deploy/serial_hub.py` in MSI and dev.
6. Update Phase 2 plan progress and daily log only after validations; keep Phase 1 remaining manual checks for the agreed combined post-Phase-2 E2E.
7. Final hardware E2E matrix: two Tauri windows; A monitor receives MCU sensor bytes; B PC process reads via Serial blocks and independently prints coordinates; two readers receive fan-out without terminal contamination; one writer conflict error; upload while readers are present; upload refused while a PC writer lease is active; same COM unplug/replug and changed COM behavior.
