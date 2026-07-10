import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { deleteServer, listServers, listSshConfigHosts, queryKeys, saveServer, setServerEnabled, testConnection } from '../../lib/api';
import { useUiStore } from '../../lib/store';
import type { Server, ServerInput, SshConfigImportCandidate } from '../../lib/types';
import {
  buildBulkImportServerInputs,
  emptySettingsForm,
  formFromServer,
  formFromSshConfigCandidate,
  getBulkImportCandidateMetadata,
  invalidateSettings,
  toBulkImportServerInput,
  toServerInput,
  validateSettingsForm,
  type BulkImportCandidateMetadata,
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

const errorMessageFromUnknown = (error: unknown) => (error instanceof Error ? error.message : 'Unknown save failure.');

export const useSettingsController = () => {
  const queryClient = useQueryClient();
  const editingServerId = useUiStore((state) => state.editingServerId);
  const editServer = useUiStore((state) => state.editServer);
  const selectServer = useUiStore((state) => state.selectServer);
  const [form, setForm] = useState<SettingsFormState>(emptySettingsForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedImportHostAliases, setSelectedImportHostAliases] = useState<readonly string[]>([]);
  const [bulkImportSaveResult, setBulkImportSaveResult] = useState<BulkImportSaveResult | null>(null);
  const serversQuery = useQuery({ queryKey: queryKeys.servers, queryFn: listServers });
  const servers = serversQuery.data;
  const editingServer = useMemo(() => servers?.find((server) => server.id === editingServerId) ?? null, [editingServerId, servers]);

  const saveMutation = useMutation({
    mutationFn: saveServer,
    onSuccess: (server) => {
      selectServer(server.id);
      editServer(server.id);
      return invalidateSettings(queryClient);
    }
  });
  const deleteMutation = useMutation({
    mutationFn: deleteServer,
    onSuccess: () => {
      editServer(null);
      selectServer(null);
      return invalidateSettings(queryClient);
    }
  });
  const enabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { readonly id: string; readonly enabled: boolean }) => setServerEnabled(id, enabled),
    onSuccess: () => invalidateSettings(queryClient)
  });
  const testMutation = useMutation({ mutationFn: testConnection });
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
        candidates: importResult?.candidates ?? [],
        existingServers: servers ?? [],
        selectedHostAliases: selectedImportHostAliases
      });
      const saveableItems = selectedMetadata.filter((item) => item.selectable);
      const saved: Server[] = [];
      const failed: BulkImportSaveFailure[] = [];

      for (const item of saveableItems) {
        const input = toBulkImportServerInput(item.candidate);
        try {
          saved.push(await saveServer(input));
        } catch (error) {
          failed.push({ candidate: item.candidate, input, message: errorMessageFromUnknown(error) });
        }
      }

      if (saved.length > 0) {
        await invalidateSettings(queryClient);
      }

      return { saved, skipped: selection.skipped, failed };
    },
    onSuccess: (result) => {
      setBulkImportSaveResult(result);
    }
  });
  const resetTestMutation = testMutation.reset;

  useEffect(() => {
    setForm(editingServer ? formFromServer(editingServer) : emptySettingsForm);
    setFormError(null);
    resetTestMutation();
  }, [editingServer, resetTestMutation]);

  const updateField = (field: keyof SettingsFormState, value: string | boolean) => {
    setFormError(null);
    setForm((current) => ({ ...current, [field]: value }));
  };

  const importCandidate = (candidate: SshConfigImportCandidate) => {
    setFormError(null);
    setForm(formFromSshConfigCandidate(candidate));
  };

  const selectAllImportableCandidates = () => {
    setBulkImportSaveResult(null);
    setSelectedImportHostAliases(bulkImportCandidateMetadata.filter((item) => item.selectable).map((item) => item.candidate.hostAlias));
  };

  const toggleImportCandidateSelection = (hostAlias: string) => {
    setBulkImportSaveResult(null);
    setSelectedImportHostAliases((current) => {
      if (current.includes(hostAlias)) {
        return current.filter((selectedHostAlias) => selectedHostAlias !== hostAlias);
      }
      return [...current, hostAlias];
    });
  };

  const saveSelectedImportCandidates = () => bulkImportSaveMutation.mutateAsync();

  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateSettingsForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    saveMutation.mutate(toServerInput(form));
  };

  return {
    connectionResult: testMutation.data,
    bulkImportCandidateMetadata,
    bulkImportSaveMutation,
    bulkImportSaveResult,
    deleteMutation,
    editServer,
    enabledMutation,
    form,
    formError,
    importCandidate,
    importResult,
    mutationError: saveMutation.error ?? deleteMutation.error ?? enabledMutation.error ?? testMutation.error,
    saveMutation,
    saveSelectedImportCandidates,
    selectAllImportableCandidates,
    selectedImportHostAliases,
    servers,
    serversQuery,
    sshConfigImportMutation,
    submitForm,
    testMutation,
    toggleImportCandidateSelection,
    updateField
  };
};
