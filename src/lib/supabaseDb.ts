import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase PostgreSQL Real Database Service Client
// Communicates directly with the PostgreSQL database backend (Supabase / Local Server)

const supabaseUrl = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) || '';
const supabaseAnonKey = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) || '';

export const supabase: SupabaseClient | null = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface SupabaseDbStatus {
  connected: boolean;
  engine: string;
  host: string;
  database: string;
  latencyMs: number;
  serverTime?: string;
  counts?: {
    companies: number;
    products: number;
    invoices: number;
    customers: number;
    debtTransactions: number;
    inventorySlots: number;
  };
  error?: string;
}

export interface SupabaseAuthResponse {
  success: boolean;
  message?: string;
  sessionToken?: string;
  data?: {
    username: string;
    enterpriseName: string;
    data: any;
  };
}

/**
 * Checks connectivity and table record counts in Supabase PostgreSQL
 */
export async function checkSupabaseStatus(): Promise<SupabaseDbStatus> {
  try {
    const res = await fetch('/api/db/status');
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Failed to reach database`);
    }
    return await res.json();
  } catch (err: any) {
    return {
      connected: false,
      engine: 'Supabase PostgreSQL',
      host: 'db.eqxzxmolcvqctkgcbpxy.supabase.co',
      database: 'postgres',
      latencyMs: 0,
      error: err?.message || 'Connection failed'
    };
  }
}

/**
 * Direct lookup of product by barcode or SKU in the database
 */
export async function lookupProductFromDatabase(
  username: string, 
  barcodeOrSku: string
): Promise<{ found: boolean; product?: any; stock: number; message?: string }> {
  try {
    const cleanUser = encodeURIComponent(username.toLowerCase().trim());
    const cleanCode = encodeURIComponent(barcodeOrSku.trim());
    const res = await fetch(`/api/db/product/lookup?username=${cleanUser}&barcode=${cleanCode}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    const json = await res.json();
    return {
      found: Boolean(json.found),
      product: json.product || null,
      stock: Number(json.stock) || 0
    };
  } catch (err: any) {
    console.warn('Product database lookup notice:', err?.message || err);
    return { found: false, stock: 0, message: err?.message };
  }
}

/**
 * Saves a new product to the database atomically and confirms receipt with ID
 */
export async function createProductInDatabase(
  username: string,
  product: any,
  initialStock: number = 0,
  warehouseId?: string,
  clientId?: string
): Promise<{ success: boolean; product?: any; inventory?: any; message?: string }> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (clientId) headers['x-client-id'] = clientId;

    const res = await fetch('/api/db/product', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        username,
        product,
        initialStock,
        warehouseId,
        clientId
      })
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || `Failed to create product (HTTP ${res.status})`);
    }
    return json;
  } catch (err: any) {
    console.error('Failed to save product to database:', err);
    return {
      success: false,
      message: err?.message || 'Khalad ayaa dhacay markii la keydinayay alaabta database-ka.'
    };
  }
}

/**
 * Executes a POS sale transaction atomically with database-level inventory deduction
 */
export async function executeSaleInDatabase(
  username: string,
  salePayload: any,
  clientId?: string
): Promise<{ success: boolean; invoice?: any; updatedInventory?: any[]; updatedCustomer?: any; message?: string }> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (clientId) headers['x-client-id'] = clientId;

    const res = await fetch('/api/db/sale', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        username,
        sale: salePayload,
        clientId
      })
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || `Sale failed (HTTP ${res.status})`);
    }
    return json;
  } catch (err: any) {
    console.error('Sale transaction error:', err);
    return {
      success: false,
      message: err?.message || 'Sale failed at database level.'
    };
  }
}

/**
 * Authenticates store company in Supabase PostgreSQL
 */
export async function loginCompanyFromSupabase(
  username: string, 
  passcode: string
): Promise<SupabaseAuthResponse> {
  try {
    const res = await fetch('/api/db/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, passcode })
    });
    const json = await res.json();
    return json;
  } catch (err: any) {
    console.error('Supabase login error:', err);
    return {
      success: false,
      message: err?.message || 'Failed to authenticate against Supabase PostgreSQL.'
    };
  }
}

/**
 * Loads entire store state for the company from Supabase PostgreSQL
 */
export async function loadCompanyFromSupabase(username: string): Promise<any> {
  try {
    const res = await fetch(`/api/db/load/${encodeURIComponent(username)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data || null;
  } catch (err) {
    console.error('Failed to load state from Supabase:', err);
    return null;
  }
}

/**
 * Synchronizes all store state to Local Database
 */
export async function syncCompanyToSupabase(
  username: string, 
  payload: any,
  clientId?: string
): Promise<{ success: boolean; message?: string; time?: string }> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (clientId) {
      headers['x-client-id'] = clientId;
    }
    const res = await fetch('/api/db/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({ username, payload, clientId })
    });
    const json = await res.json();
    return json;
  } catch (err: any) {
    console.warn('Sync notice:', err?.message || err);
    return {
      success: false,
      message: err?.message || 'Sync failed.'
    };
  }
}

export interface NetworkDeviceInfo {
  ip: string;
  name: string;
  type: string;
  url: string;
}

export interface NetworkInfoResponse {
  success: boolean;
  port: number;
  localhostUrl: string;
  devices: NetworkDeviceInfo[];
  primaryUrl: string;
  connectedDevicesCount: number;
}

/**
 * Fetches host computer's local network IPs (Wi-Fi Hotspot / LAN)
 */
export async function fetchNetworkInfo(): Promise<NetworkInfoResponse | null> {
  try {
    const res = await fetch('/api/network/info');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface ClientBackupItem {
  filename: string;
  createdAt: string;
  sizeBytes: number;
  formattedSize: string;
  label?: string;
  counts: {
    products: number;
    invoices: number;
    customers: number;
    debtTransactions: number;
  };
}

/**
 * Lists all automatic and manual backups from server disk
 */
export async function fetchBackupsList(): Promise<ClientBackupItem[]> {
  try {
    const res = await fetch('/api/db/backups');
    if (!res.ok) return [];
    const data = await res.json();
    return data?.backups || [];
  } catch {
    return [];
  }
}

/**
 * Creates an instantaneous database backup snapshot
 */
export async function createInstantBackup(label?: string): Promise<{ success: boolean; message: string; backup?: ClientBackupItem }> {
  try {
    const res = await fetch('/api/db/backups/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label })
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to create backup.' };
  }
}

/**
 * Restores entire database from an existing backup snapshot file
 */
export async function restoreBackupFromFile(filename: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/db/backups/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename })
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to restore backup.' };
  }
}

/**
 * Deletes a backup snapshot from disk
 */
export async function deleteBackupFile(filename: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/db/backups/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    return Boolean(data?.success);
  } catch {
    return false;
  }
}
