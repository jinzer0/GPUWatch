import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { deleteServer, listServers, listSshConfigHosts, queryKeys, saveServer, setServerEnabled, testConnection } from '../../lib/api';
import { useUiStore } from '../../lib/store';
import type { ConnectionTestResultDto, Server, ServerInput, SshConfigImportCandidate } from '../../lib/types';
import {
  buildBulkImportServerInputs,
  emptySettingsForm,
  formFromServer,
  formFromSshConfigCandidate,
  getBulkImportCandidateMetadata,
  invalidateSettings,
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
}

interface EnableOperation {
  readonly error: Error | null;
  readonly isPending: boolean;
}

interface DeleteTarget {
  readonly id: string;
  readonly name: string;
}

const errorFromUnknown = (error: unknown, fallback: string): Error => error instanceof Error ? error : new Error(fallback);

export const useSettingsController = () => {
  const queryClient = useQueryClient();
  const editingServerId = useUiStore((state) => state.editingServerId);
  const setEditingServer = useUiStore((state) => state.editServer);
  const selectServer = useUiStore((state) => state.selectServer);
  const [editor, setEditor] = useState<EditorState>({ baseline: emptySettingsForm, form: emptySettingsForm, selectedServerId: null });
  const [fieldErrors, setFieldErrors] = useState<SettingsFieldErrors>({});
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResultDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [enableOperations, setEnableOperations] = useState<Readonly<Record<string, EnableOperation | undefined>>>({});
  const [selectedImportHostAliases, setSelectedImportHostAliases] = useState<readonly string[]>([]);
  const [bulkImportSaveResult, setBulkImportSaveResult] = useState<BulkImportSaveResult | null>(null);
  const targetVersion = useRef(0);
  const serversQuery = useQuery({ queryKey: queryKeys.servers, queryFn: listServers });
  const servers = serversQuery.data;
  const editingServer = useMemo(() => servers?.find((server) => server.id === editingServerId) ?? null, [editingServerId, servers]);

  const replaceEditor = (form: SettingsFormState, selectedServerId: string | null) => {
    targetVersion.current += 1;
    setConnectionResult(null);
    setFieldErrors({});
    setEditor({ baseline: form, form, selectedServerId });
  };

  const saveMutation = useMutation({
    mutationFn: ({ input }: TargetedRequest<ServerInput>) => saveServer(input),
    onSuccess: (server) => {
      replaceEditor(formFromServer(server), server.id);
      selectServer(server.id);
      setEditingServer(server.id);
      return invalidateSettings(queryClient);
    }
  });
  const deleteMutation = useMutation({
    mutationFn: deleteServer,
    onSuccess: () => {
      replaceEditor(emptySettingsForm, null);
      setDeleteTarget(null);
      setEditingServer(null);
      selectServer(null);
      return invalidateSettings(queryClient);
    }
  });
  const enabledMutation = useMutation({
    mutationFn: async ({ id, enabled }: { readonly id: string; readonly enabled: boolean }) => {
      setEnableOperations((current) => ({ ...current, [id]: { error: null, isPending: true } }));
      try {
        const server = await setServerEnabled(id, enabled);
        setEnableOperations((current) => ({ ...current, [id]: { error: null, isPending: false } }));
        return server;
      } catch (error) {
        setEnableOperations((current) => ({ ...current, [id]: { error: errorFromUnknown(error, 'Unknown enable failure.'), isPending: false } }));
        throw error;
      }
    },
    onSuccess: () => invalidateSettings(queryClient)
  });
  const testMutation = useMutation({
    mutationFn: ({ input }: TargetedRequest<string>) => testConnection(input),
    onSuccess: (result, request) => {
      if (request.targetVersion === targetVersion.current) {
        setConnectionResult(result);
      }
    }
  });
  const sshConfigImportMutation = useMutation({
    mutationFn: listSshConfigHosts,
    onSuccess: () => {
      setSelectedImportHostAliases([]);
      setBulkImportSaveResult(null);
    }
  });
  const importResult = sshConfigImportMutation.data;
  const bulkImportCandidateMetadata = useMemo(
    () => getBulkImportCandidateMetadata({ candidates: importResult?.candidates ?? [], existingServers: servers ?? [] }),
    [importResult?.candidates, servers]
  );
  const bulkImportSaveMutation = useMutation({
    mutationFn: async (): Promise<BulkImportSaveResult> => {
      const selectedAliases = new Set(selectedImportHostAliases);
      const selectedMetadata = bulkImportCandidateMetadata.filter((item) => selectedAliases.has(item.candidate.hostAlias));
      const selection = buildBulkImportServerInputs({
        candidates: importResult?.candidates ?? [], existingServers: servers ?? [], selectedHostAliases: selectedImportHostAliases
      });
      const saved: Server[] = [];
      const failed: BulkImportSaveFailure[] = [];
      for (const item of selectedMetadata.filter((metadata) => metadata.selectable)) {
        const input = toBulkImportServerInput(item.candidate);
        try {
          saved.push(await saveServer(input));
        } catch (error) {
          failed.push({ candidate: item.candidate, input, message: errorFromUnknown(error, 'Unknown save failure.').message });
        }
      }
      if (saved.length > 0) {
        await invalidateSettings(queryClient);
      }
      return { saved, skipped: selection.skipped, failed };
    },
    onSuccess: setBulkImportSaveResult
  });

  useEffect(() => {
    if (editingServerId === editor.selectedServerId) {
      return;
    }
    if (editingServerId === null) {
      replaceEditor(emptySettingsForm, null);
    } else if (editingServer) {
      replaceEditor(formFromServer(editingServer), editingServer.id);
    }
  }, [editingServer, editingServerId, editor.selectedServerId]);

  const editServer = (id: string | null) => {
    if (id === null) {
      replaceEditor(emptySettingsForm, null);
    } else {
      const server = servers?.find((item) => item.id === id);
      if (server) {
        replaceEditor(formFromServer(server), server.id);
      }
    }
    setEditingServer(id);
  };
  const updateField = (field: keyof SettingsFormState, value: string | boolean) => {
    setFieldErrors({});
    setEditor((current) => ({ ...current, form: { ...current.form, [field]: value } }));
  };
  const importCandidate = (candidate: SshConfigImportCandidate) => {
    setEditingServer(null);
    replaceEditor(formFromSshConfigCandidate(candidate), null);
  };
  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateSettingsFormResult(editor.form);
    setFieldErrors(validation.fieldErrors);
    if (validation.isValid) {
      saveMutation.mutate({ input: toServerInput(editor.form), targetVersion: targetVersion.current });
    }
  };
  const testCurrentConnection = () => {
    if (editor.form.id) {
      setConnectionResult(null);
      testMutation.mutate({ input: editor.form.id, targetVersion: targetVersion.current });
    }
  };
  const requestDelete = () => {
    if (editor.form.id) {
      deleteMutation.reset();
      setDeleteTarget({ id: editor.form.id, name: editor.form.name });
    }
  };
  const confirmDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.id);
    }
  };
  const cancelDelete = () => {
    deleteMutation.reset();
    setDeleteTarget(null);
  };
  const selectAllImportableCandidates = () => {
    setBulkImportSaveResult(null);
    setSelectedImportHostAliases(bulkImportCandidateMetadata.filter((item) => item.selectable).map((item) => item.candidate.hostAlias));
  };
  const toggleImportCandidateSelection = (hostAlias: string) => {
    setBulkImportSaveResult(null);
    setSelectedImportHostAliases((current) => current.includes(hostAlias)
      ? current.filter((selectedHostAlias) => selectedHostAlias !== hostAlias)
      : [...current, hostAlias]);
  };
  const saveTargetsCurrentEditor = saveMutation.variables?.targetVersion === targetVersion.current;
  const activeTestRequest = testMutation.variables?.targetVersion === targetVersion.current ? testMutation : null;

  return {
    bulkImportCandidateMetadata, bulkImportSaveMutation, bulkImportSaveResult,
    cancelDelete, confirmDelete,
    connectionResult, connectionTestError: activeTestRequest?.error ?? null,
    deleteError: deleteMutation.error, deleteTarget, editServer, enableOperations,
    enableServer: enabledMutation.mutate, fieldErrors, form: editor.form,
    formError: Object.values(fieldErrors)[0] ?? null, importCandidate, importResult,
    isConnectionTestPending: activeTestRequest?.isPending ?? false,
		isDeletePending: deleteMutation.isPending,
		isFormDirty: editor.form !== editor.baseline, isSavePending: saveMutation.isPending,
		requestDelete, saveError: saveTargetsCurrentEditor ? saveMutation.error : null,
		saveSelectedImportCandidates: () => bulkImportSaveMutation.mutateAsync(),
		saveTargetId: saveMutation.isPending ? saveMutation.variables?.input.id ?? null : null,
		selectAllImportableCandidates, selectedImportHostAliases, selectedServerId: editor.selectedServerId, servers, serversQuery,
		sshConfigImportMutation, submitForm, testCurrentConnection,
		toggleImportCandidateSelection, updateField
	};
};
