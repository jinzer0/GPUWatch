import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { deleteServer, listServers, listSshConfigHosts, queryKeys, saveServer, testConnection } from '../../lib/api';
import { useUiStore } from '../../lib/store';
import type { ConnectionTestResultDto, Server, ServerInput, ServerOverviewDto, SshConfigImportCandidate, SshConfigImportResult } from '../../lib/types';
import {
  emptySettingsForm,
  formFromServer,
  formFromSshConfigCandidate,
  getBulkImportCandidateMetadata,
  invalidateSettings,
  settingsFormsEqual,
  toBulkImportServerInput,
  toServerInput,
  validateSettingsFormResult,
  type BulkImportCandidateMetadata,
  type SettingsFieldErrors,
  type SettingsFormState
} from './settingsModel';

interface BulkImportSaveFailure {
  readonly candidate: SshConfigImportCandidate;
  readonly input: ServerInput;
  readonly message: string;
}

interface BulkImportSaveResult {
  readonly saved: readonly Server[];
  readonly skipped: readonly BulkImportCandidateMetadata[];
  readonly failed: readonly BulkImportSaveFailure[];
}

interface EditorState {
  readonly baseline: SettingsFormState;
  readonly form: SettingsFormState;
  readonly selectedServerId: string | null;
}

interface TargetedRequest<Input> {
  readonly input: Input;
  readonly targetVersion: number;
  readonly managementRequestId: number;
}

interface DeleteTarget {
  readonly id: string;
  readonly name: string;
}

const errorFromUnknown = (error: unknown, fallback: string): Error => error instanceof Error ? error : new Error(fallback);

export const useSettingsController = () => {
  const queryClient = useQueryClient();
  const editingServerId = useUiStore((state) => state.editingServerId);
  const managementAction = useUiStore((state) => state.managementAction);
  const managementOpen = useUiStore((state) => state.managementOpen);
  const managementRequestId = useUiStore((state) => state.managementRequestId);
  const setEditingServer = useUiStore((state) => state.editServer);
  const closeServerManager = useUiStore((state) => state.closeServerManager);
  const [editor, setEditor] = useState<EditorState>({ baseline: emptySettingsForm, form: emptySettingsForm, selectedServerId: null });
  const [fieldErrors, setFieldErrors] = useState<SettingsFieldErrors>({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResultDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [selectedImportHostAliases, setSelectedImportHostAliases] = useState<readonly string[]>([]);
  const [importResult, setImportResult] = useState<SshConfigImportResult | undefined>();
  const [bulkImportSaveResult, setBulkImportSaveResult] = useState<BulkImportSaveResult | null>(null);
  const [importedServers, setImportedServers] = useState<readonly Server[]>([]);
  const importedServersRef = useRef<readonly Server[]>([]);
  const bulkImportPending = useRef(false);
  const targetVersion = useRef(0);
  const observedRequest = useRef(managementRequestId);
  const clearedRequest = useRef<number | null>(null);
  const initializedRequest = useRef<number | null>(null);
  if (observedRequest.current !== managementRequestId) {
    observedRequest.current = managementRequestId;
    targetVersion.current += 1;
  }
  const serversQuery = useQuery({ queryKey: queryKeys.servers, queryFn: listServers });
  const servers = serversQuery.data;
  const editingServer = useMemo(() => servers?.find((server) => server.id === editingServerId) ?? null, [editingServerId, servers]);

  const requestIsCurrent = (request: TargetedRequest<unknown>) =>
    request.targetVersion === targetVersion.current &&
    request.managementRequestId === useUiStore.getState().managementRequestId;

  const replaceEditor = (form: SettingsFormState, selectedServerId: string | null, baseline = form) => {
    targetVersion.current += 1;
    setSaveSuccess(false);
    setConnectionResult(null);
    setFieldErrors({});
    setDeleteTarget(null);
    setEditor({ baseline, form, selectedServerId });
  };

  const saveMutation = useMutation({
    mutationFn: ({ input }: TargetedRequest<ServerInput>) => saveServer(input),
    onSuccess: (server, request) => {
      if (requestIsCurrent(request)) {
        useUiStore.getState().selectServer(server.id);
        setEditingServer(server.id);
        const nextRequestId = useUiStore.getState().managementRequestId;
        observedRequest.current = nextRequestId;
        clearedRequest.current = nextRequestId;
        initializedRequest.current = nextRequestId;
        replaceEditor(formFromServer(server), server.id);
        setSaveSuccess(true);
      }
      return invalidateSettings(queryClient);
    }
  });
  const deleteMutation = useMutation({
    mutationFn: ({ input }: TargetedRequest<DeleteTarget>) => deleteServer(input.id),
    onSuccess: (_, request) => {
      queryClient.setQueryData<readonly Server[]>(queryKeys.servers, (current) => current?.filter((server) => server.id !== request.input.id));
      queryClient.setQueryData<readonly ServerOverviewDto[]>(queryKeys.overview, (current) => current?.filter((server) => server.id !== request.input.id));
      const state = useUiStore.getState();
      if (state.selectedServerId === request.input.id) {
        state.selectServer(null);
      }
      if (requestIsCurrent(request)) {
        replaceEditor(emptySettingsForm, null);
        closeServerManager();
      }
      return invalidateSettings(queryClient);
    }
  });
  const testMutation = useMutation({
    mutationFn: ({ input }: TargetedRequest<string>) => testConnection(input),
    onSuccess: (result, request) => {
      if (requestIsCurrent(request)) {
        setConnectionResult(result);
      }
    }
  });
  const sshConfigImportMutation = useMutation({
    mutationFn: listSshConfigHosts,
    onSuccess: setImportResult
  });
  const bulkImportCandidateMetadata = useMemo(
    () => getBulkImportCandidateMetadata({ candidates: importResult?.candidates ?? [], existingServers: [...(servers ?? []), ...importedServers] }),
    [importResult?.candidates, servers, importedServers]
  );
  const bulkImportSaveMutation = useMutation({
    mutationFn: async (): Promise<BulkImportSaveResult> => {
      if (bulkImportPending.current) {
        throw new Error('A bulk import is already pending.');
      }
      bulkImportPending.current = true;
      try {
        const selectedAliases = new Set(selectedImportHostAliases);
        const metadata = getBulkImportCandidateMetadata({
          candidates: importResult?.candidates ?? [],
          existingServers: [...(servers ?? []), ...importedServersRef.current]
        });
        const selected = metadata.filter((item) => selectedAliases.has(item.candidate.hostAlias));
        const saved: Server[] = [];
        const failed: BulkImportSaveFailure[] = [];
        const savedAliases = new Set<string>();
        for (const item of selected.filter((candidate) => candidate.selectable)) {
          const input = toBulkImportServerInput(item.candidate);
          try {
            const server = await saveServer(input);
            saved.push(server);
            savedAliases.add(item.candidate.hostAlias);
            importedServersRef.current = [...importedServersRef.current, server];
            setImportedServers(importedServersRef.current);
            setSelectedImportHostAliases((current) => current.filter((alias) => alias !== item.candidate.hostAlias));
          } catch (error) {
            failed.push({ candidate: item.candidate, input, message: errorFromUnknown(error, 'Unknown save failure.').message });
          }
        }
        const skipped = selected.filter((item) => !item.selectable);
        const attemptedAliases = new Set(selected.map((item) => item.candidate.hostAlias));
        setBulkImportSaveResult((current) => ({
          saved: [...(current?.saved ?? []), ...saved],
          skipped,
          failed: [...(current?.failed ?? []).filter((item) => !attemptedAliases.has(item.candidate.hostAlias)), ...failed]
        }));
        setSelectedImportHostAliases((current) => current.filter((alias) => !savedAliases.has(alias)));
        if (saved.length > 0) {
          void invalidateSettings(queryClient);
        }
        return { saved, skipped, failed };
      } finally {
        bulkImportPending.current = false;
      }
    }
  });

  useEffect(() => {
    if (clearedRequest.current !== managementRequestId) {
      clearedRequest.current = managementRequestId;
      replaceEditor(emptySettingsForm, null);
    }
    if (!managementOpen || initializedRequest.current === managementRequestId) {
      return;
    }
    if (editingServerId !== null && !editingServer) {
      return;
    }
    initializedRequest.current = managementRequestId;
    const form = editingServer ? formFromServer(editingServer) : emptySettingsForm;
    replaceEditor(form, editingServer?.id ?? null);
    if (managementAction === 'delete' && editingServer) {
      deleteMutation.reset();
      setDeleteTarget({ id: editingServer.id, name: editingServer.name });
    } else if (managementAction === 'test' && editingServer) {
      testMutation.mutate({ input: editingServer.id, targetVersion: targetVersion.current, managementRequestId });
    }
  }, [managementOpen, managementRequestId, managementAction, editingServerId, editingServer]);

  const updateField = (field: keyof SettingsFormState, value: string | boolean) => {
    targetVersion.current += 1;
    setSaveSuccess(false);
    setConnectionResult(null);
    setFieldErrors({});
    setEditor((current) => ({ ...current, form: { ...current.form, [field]: value } }));
  };
  const importCandidate = (candidate: SshConfigImportCandidate) => {
    setEditingServer(null);
    const nextRequestId = useUiStore.getState().managementRequestId;
    observedRequest.current = nextRequestId;
    clearedRequest.current = nextRequestId;
    initializedRequest.current = nextRequestId;
    replaceEditor({ ...formFromSshConfigCandidate(candidate), id: null }, null, emptySettingsForm);
  };
  const operationPending = saveMutation.isPending || deleteMutation.isPending || bulkImportSaveMutation.isPending;
  const editorIsCurrent = managementOpen && initializedRequest.current === managementRequestId &&
    editor.selectedServerId === editingServerId;
  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (operationPending || !editorIsCurrent) {
      return;
    }
    const validation = validateSettingsFormResult(editor.form);
    setFieldErrors(validation.fieldErrors);
    setSaveSuccess(false);
    if (validation.isValid) {
      saveMutation.mutate({ input: toServerInput(editor.form), targetVersion: targetVersion.current, managementRequestId });
    }
  };
  const testCurrentConnection = () => {
    if (editorIsCurrent && editor.selectedServerId && !operationPending && !testMutation.isPending) {
      setConnectionResult(null);
      testMutation.mutate({ input: editor.selectedServerId, targetVersion: targetVersion.current, managementRequestId });
    }
  };
  const requestDelete = () => {
    const server = servers?.find((item) => item.id === editor.selectedServerId);
    if (editorIsCurrent && server && !operationPending) {
      deleteMutation.reset();
      setDeleteTarget({ id: server.id, name: server.name });
    }
  };
  const confirmDelete = () => {
    if (editorIsCurrent && deleteTarget && !operationPending) {
      deleteMutation.mutate({ input: deleteTarget, targetVersion: targetVersion.current, managementRequestId });
    }
  };
  const cancelDelete = () => {
    if (!deleteMutation.isPending) {
      deleteMutation.reset();
      setDeleteTarget(null);
    }
  };
  const selectAllImportableCandidates = () => {
    if (!bulkImportSaveMutation.isPending) {
      setSelectedImportHostAliases(bulkImportCandidateMetadata.filter((item) => item.selectable).map((item) => item.candidate.hostAlias));
    }
  };
  const toggleImportCandidateSelection = (hostAlias: string) => {
    if (bulkImportSaveMutation.isPending) {
      return;
    }
    setSelectedImportHostAliases((current) => current.includes(hostAlias)
      ? current.filter((selectedHostAlias) => selectedHostAlias !== hostAlias)
      : bulkImportCandidateMetadata.some((item) => item.candidate.hostAlias === hostAlias && item.selectable)
        ? [...current, hostAlias] : current);
  };
  const saveTargetsCurrentEditor = saveMutation.variables ? requestIsCurrent(saveMutation.variables) : false;
  const activeTestRequest = testMutation.variables && requestIsCurrent(testMutation.variables) ? testMutation : null;
  const activeDeleteRequest = deleteMutation.variables && requestIsCurrent(deleteMutation.variables) ? deleteMutation : null;
  const isTargetNotFound = editingServerId !== null && serversQuery.isSuccess && editingServer === null;

  return {
    bulkImportCandidateMetadata, bulkImportSaveMutation, bulkImportSaveResult,
    cancelDelete, confirmDelete,
    connectionResult, connectionTestError: activeTestRequest?.error ?? null,
    deleteError: activeDeleteRequest?.error ?? null, deleteTarget,
    fieldErrors, form: editor.form,
    formError: Object.values(fieldErrors)[0] ?? null, importCandidate, importResult,
    isConnectionTestPending: activeTestRequest?.isPending ?? false,
    isDeletePending: deleteMutation.isPending,
    isFormDirty: !settingsFormsEqual(editor.form, editor.baseline), isSavePending: saveMutation.isPending,
    isTargetNotFound, operationPending, saveSuccess: editorIsCurrent && saveSuccess,
    requestDelete, saveError: saveTargetsCurrentEditor ? saveMutation.error : null,
    saveSelectedImportCandidates: () => bulkImportSaveMutation.mutateAsync(),
    selectAllImportableCandidates, selectedImportHostAliases, selectedServerId: editor.selectedServerId, servers, serversQuery,
    sshConfigImportMutation, submitForm, testCurrentConnection,
    toggleImportCandidateSelection, updateField
  };
};
