import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button, DiagnosticPanel, ErrorState, LoadingState, ResultFeedback, RightDrawer } from '../../components/ui';
import { formatUnknown } from '../../lib/format';
import { useUiStore } from '../../lib/store';
import type { ServerManagementAction } from '../../lib/store';
import { SettingsImportPanel } from './SettingsImportPanel';
import { SettingsServerForm } from './SettingsServerForm';
import { useSettingsController } from './useSettingsController';

const titles: Record<ServerManagementAction, string> = {
  add: '서버 추가',
  edit: '서버 편집',
  delete: '서버 삭제',
  test: 'SSH 연결 테스트',
  import: 'SSH config 가져오기'
};

export const ServerManagerSheet = () => {
  const action = useUiStore((state) => state.managementAction);
  const closeServerManager = useUiStore((state) => state.closeServerManager);
  const controller = useSettingsController();
  const current = useRef(controller);
  current.current = controller;
  const [reviewDiscard, setReviewDiscard] = useState(false);
  const [closeBlocked, setCloseBlocked] = useState(false);
  const importHeadingRef = useRef<HTMLHeadingElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const lastControlId = useRef<string | null>(null);
  const mutationLatch = useRef(false);
  const invokerRef = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);

  const requestClose = useCallback(() => {
    const state = current.current;
    if (state.operationPending) {
      setCloseBlocked(true);
      return;
    }
    if (state.isFormDirty || state.selectedImportHostAliases.length > 0) {
      lastControlId.current = document.activeElement instanceof HTMLElement ? document.activeElement.id : null;
      setReviewDiscard(true);
      return;
    }
    closeServerManager();
  }, [closeServerManager]);

  useEffect(() => {
    return () => {
      if (!invokerRef.current?.isConnected) {
        requestAnimationFrame(() => {
          if (!document.querySelector('.server-manager-modal')) document.querySelector<HTMLButtonElement>('[data-server-add-trigger]')?.focus();
        });
      }
    };
  }, []);
  useEffect(() => {
    if (reviewDiscard) continueRef.current?.focus();
  }, [reviewDiscard]);
  useEffect(() => {
    if (action === 'delete' && controller.deleteTarget) deleteCancelRef.current?.focus();
  }, [action, controller.deleteTarget]);
  useEffect(() => {
    if (!controller.operationPending) {
      mutationLatch.current = false;
      setCloseBlocked(false);
    }
  }, [controller.operationPending]);

  const continueEditing = () => {
    setReviewDiscard(false);
    requestAnimationFrame(() => {
      const field = lastControlId.current ? document.getElementById(lastControlId.current) : null;
      (field ?? document.querySelector<HTMLButtonElement>('.server-manager-modal button[aria-label="Close drawer"]'))?.focus();
    });
  };
  const confirmDelete = () => {
    if (mutationLatch.current || controller.operationPending) return;
    mutationLatch.current = true;
    controller.confirmDelete();
  };
  const savedTargetRequired = action === 'edit' || action === 'delete' || action === 'test';
  const ready = !controller.serversQuery.isLoading && !controller.isTargetNotFound &&
    (!savedTargetRequired || controller.form.id !== null);

  return createPortal(
    <div className="server-manager-modal">
      <RightDrawer ariaLabel={titles[action]} onClose={requestClose} title={titles[action]}>
        {closeBlocked ? <p role="status">저장 또는 삭제 처리 중입니다. 결과를 확인한 뒤 닫아 주세요.</p> : null}
        {reviewDiscard ? (
          <section aria-labelledby="discard-changes-title" role="alertdialog">
            <h3 id="discard-changes-title">미저장 변경을 버릴까요?</h3>
            <p>저장하지 않은 입력과 가져오기 선택이 사라집니다.</p>
            <div className="server-manager-actions">
              <button className="btn btn-secondary btn-sm" onClick={continueEditing} ref={continueRef} type="button">계속 편집</button>
              <Button onClick={closeServerManager} type="button" variant="danger">변경 버리기</Button>
            </div>
          </section>
        ) : (
          <>
            {controller.serversQuery.isLoading ? <LoadingState label="저장된 서버 설정을 읽는 중입니다..." /> : null}
            {controller.serversQuery.error ? <ErrorState message={controller.serversQuery.error.message} /> : null}
            {controller.isTargetNotFound ? <p role="alert">선택한 서버를 찾을 수 없습니다. 목록을 확인한 뒤 다시 열어 주세요.</p> : null}
            {ready && action === 'import' && !controller.serversQuery.error ? (
              <SettingsImportPanel {...controller} headingRef={importHeadingRef} />
            ) : null}
            {ready && (action === 'add' || action === 'edit') ? <SettingsServerForm {...controller} /> : null}
            {ready && action === 'delete' ? (
              <section aria-label="삭제 확인">
                <p>Delete {controller.deleteTarget?.name ?? controller.form.name}?</p>
                <p>이 Mac의 서버 설정만 삭제하며 원격 호스트를 변경하지 않습니다.</p>
                <div className="server-manager-actions">
                  <button className="btn btn-secondary btn-sm" disabled={controller.isDeletePending} onClick={() => {
                    controller.cancelDelete();
                    closeServerManager();
                  }} ref={deleteCancelRef} type="button">Cancel delete</button>
                  <Button disabled={controller.isDeletePending || !controller.deleteTarget} onClick={confirmDelete} type="button" variant="danger">
                    Confirm delete {controller.deleteTarget?.name ?? controller.form.name}
                  </Button>
                </div>
                {controller.isDeletePending ? <ResultFeedback label="Server deletion" state="pending" /> : null}
                {controller.deleteError ? <ErrorState message={controller.deleteError.message} /> : null}
              </section>
            ) : null}
            {ready && action === 'test' ? (
              <section aria-label="Connection test">
                <p>{controller.form.name} · {controller.form.username}@{controller.form.host}:{controller.form.port}</p>
                <p>저장된 SSH 대상만 테스트합니다. 설정 저장과 연결 성공은 별개입니다.</p>
                {controller.isConnectionTestPending ? <ResultFeedback label="Connection test" state="pending" /> : null}
                {controller.connectionTestError ? <ErrorState message={controller.connectionTestError.message} /> : null}
                {controller.connectionResult ? controller.connectionResult.ok ? (
                  <ResultFeedback label="Connection test" message={formatUnknown(controller.connectionResult.message)} state="success" />
                ) : <DiagnosticPanel errorType={controller.connectionResult.errorType} message={controller.connectionResult.message} title="Connection diagnostic" /> : null}
                <Button disabled={controller.isConnectionTestPending} onClick={controller.testCurrentConnection} type="button" variant="secondary">Test SSH connection</Button>
              </section>
            ) : null}
          </>
        )}
      </RightDrawer>
    </div>,
    document.body
  );
};
