# GPUWatcher v0.1 Demo Script

1. Start the app with `npm run dev`, then run `npm run electron:dev` in a second terminal.
2. Open Overview and click `Seed demo data`.
3. Confirm the demo server shows GPU total, busy/free counts, average utilization, memory usage, max temperature, status, and last success time.
4. Open Server Detail and confirm configured host, backend snapshot hostname, driver/CUDA, GPU cards, unknown metrics, and per-GPU process rows.
5. Open Process Table and confirm process rows are sorted by GPU memory descending.
6. Open Settings, add a real SSH server, and run Test Connection.
7. Run Refresh and confirm the latest successful live snapshot appears in Overview, Server Detail, and Process Table.
8. Temporarily break the SSH host or username and refresh again; confirm the latest success remains visible as stale while the latest error is shown.
