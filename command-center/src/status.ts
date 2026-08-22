export interface VendorStatus {
  status: 'connected';
  via: 'cli' | 'manual';
  updatedAt: string;
}

const keyFor = (vendorId: string) => `status:${vendorId}`;

export async function getStatus(kv: KVNamespace, vendorId: string): Promise<VendorStatus | undefined> {
  const raw = await kv.get(keyFor(vendorId));
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as VendorStatus;
  } catch {
    return undefined;
  }
}

export async function getAllStatuses(kv: KVNamespace, vendorIds: string[]): Promise<Map<string, VendorStatus>> {
  const entries = await Promise.all(vendorIds.map(async (id) => [id, await getStatus(kv, id)] as const));
  const map = new Map<string, VendorStatus>();
  for (const [id, status] of entries) {
    if (status) map.set(id, status);
  }
  return map;
}

export async function markConnected(kv: KVNamespace, vendorId: string, via: 'cli' | 'manual'): Promise<void> {
  const status: VendorStatus = { status: 'connected', via, updatedAt: new Date().toISOString() };
  await kv.put(keyFor(vendorId), JSON.stringify(status));
}
