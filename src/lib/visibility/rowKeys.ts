import type { ProcessRowDto } from '../types';

export const serverPidKey = (row: Pick<ProcessRowDto, 'pid' | 'serverId'>) => `${row.serverId}::${row.pid}`;

export const serverGpuPidKey = (row: Pick<ProcessRowDto, 'gpuUuid' | 'pid' | 'serverId'>) => `${row.serverId}::${row.gpuUuid}::${row.pid}`;

export const processObjectKey = (row: ProcessRowDto) => `${row.serverId}::${row.gpuUuid}::${row.pid}`;
