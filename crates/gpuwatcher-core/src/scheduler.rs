use std::collections::HashSet;
use std::sync::Mutex;

use crate::config::GLOBAL_POLL_CONCURRENCY;

#[derive(Debug)]
pub struct PollScheduler {
    inner: Mutex<SchedulerState>,
    global_limit: usize,
}

#[derive(Debug, Default)]
struct SchedulerState {
    active_servers: HashSet<String>,
}

impl PollScheduler {
    pub fn new(global_limit: usize) -> Self {
        Self {
            inner: Mutex::new(SchedulerState::default()),
            global_limit,
        }
    }

    pub fn default_limit() -> Self {
        Self::new(GLOBAL_POLL_CONCURRENCY)
    }

    pub fn try_start(&self, server_id: &str) -> bool {
        let mut inner = self.inner.lock().expect("scheduler mutex poisoned");
        if inner.active_servers.contains(server_id)
            || inner.active_servers.len() >= self.global_limit
        {
            return false;
        }
        inner.active_servers.insert(server_id.to_string());
        true
    }

    pub fn finish(&self, server_id: &str) {
        let mut inner = self.inner.lock().expect("scheduler mutex poisoned");
        inner.active_servers.remove(server_id);
    }

    pub fn guard<'a>(&'a self, server_id: &'a str) -> PollSlotGuard<'a> {
        PollSlotGuard {
            scheduler: self,
            server_id,
        }
    }
}

pub struct PollSlotGuard<'a> {
    scheduler: &'a PollScheduler,
    server_id: &'a str,
}

impl Drop for PollSlotGuard<'_> {
    fn drop(&mut self) {
        self.scheduler.finish(self.server_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scheduler_enforces_per_server_single_flight() {
        let scheduler = PollScheduler::new(4);
        assert!(scheduler.try_start("server-a"));
        assert!(!scheduler.try_start("server-a"));
        scheduler.finish("server-a");
        assert!(scheduler.try_start("server-a"));
    }

    #[test]
    fn scheduler_enforces_global_limit() {
        let scheduler = PollScheduler::new(1);
        assert!(scheduler.try_start("server-a"));
        assert!(!scheduler.try_start("server-b"));
        scheduler.finish("server-a");
        assert!(scheduler.try_start("server-b"));
    }

    #[test]
    fn scheduler_guard_releases_server_slot_when_dropped() {
        let scheduler = PollScheduler::new(1);
        assert!(scheduler.try_start("server-a"));

        {
            let _guard = scheduler.guard("server-a");
            assert!(!scheduler.try_start("server-a"));
            assert!(!scheduler.try_start("server-b"));
        }

        assert!(scheduler.try_start("server-a"));
    }
}
