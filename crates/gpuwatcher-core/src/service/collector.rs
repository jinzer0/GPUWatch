use std::future::Future;
use std::pin::Pin;

use crate::command_runner::SystemSshRunner;
use crate::error::AppError;
use crate::models::{Server, SuccessEnvelope};
use crate::no_install_collector::collect_no_install_snapshot;
use crate::state::AppState;

pub(super) type SnapshotFuture<'a> =
    Pin<Box<dyn Future<Output = Result<(String, SuccessEnvelope), AppError>> + Send + 'a>>;

pub(super) trait SnapshotCollector {
    fn collect_snapshot<'a>(
        &'a self,
        state: &'a AppState,
        server: &'a Server,
    ) -> SnapshotFuture<'a>;
}

impl SnapshotCollector for SystemSshRunner {
    fn collect_snapshot<'a>(
        &'a self,
        _state: &'a AppState,
        server: &'a Server,
    ) -> SnapshotFuture<'a> {
        Box::pin(collect_no_install_snapshot(self, server))
    }
}
