import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { deleteServer, listServers, listSshConfigHosts, queryKeys, saveServer, setServerEnabled, testConnection } from '../../lib/api';
import { useUiStore } from '../../lib/store';
import type { SshConfigImportCandidate } from '../../lib/types';
import {
  emptySettingsForm,
  formFromServer,
  formFromSshConfigCandidate,
  invalidateSettings,
  toServerInput,
  validateSettingsForm,
  type SettingsFormState
} from './settingsModel';

export const useSettingsController = () => {
  const queryClient = useQueryClient();
  const editingServerId = useUiStore((state) => state.editingServerId);
  const editServer = useUiStore((state) => state.editServer);
  const selectServer = useUiStore((state) => state.selectServer);
  const [form, setForm] = useState<SettingsFormState>(emptySettingsForm);
  const [formError, setFormError] = useState<string | null>(null);
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
  const sshConfigImportMutation = useMutation({ mutationFn: listSshConfigHosts });
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
    deleteMutation,
    editServer,
    enabledMutation,
    form,
    formError,
    importCandidate,
    importResult: sshConfigImportMutation.data,
    mutationError: saveMutation.error ?? deleteMutation.error ?? enabledMutation.error ?? testMutation.error,
    saveMutation,
    servers,
    serversQuery,
    sshConfigImportMutation,
    submitForm,
    testMutation,
    updateField
  };
};
