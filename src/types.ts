import { TurnkeySDKClientBase, WalletAccount } from "@turnkey/core";
import type { TurnkeyBrowserClient } from "@turnkey/sdk-browser";
import type { TurnkeyClient } from "@turnkey/http";
import type { AccountType, AccountStorageMode } from "@miden-sdk/miden-sdk";

export type Turnkey =
  | TurnkeyClient
  | TurnkeyBrowserClient
  | TurnkeySDKClientBase;

export type TConfig = {
  /**
   * Turnkey client
   */
  client: Turnkey;
  /**
   * Turnkey organization ID
   */
  organizationId: string;
  /**
   * Turnkey wallet account public key or private key ID
   */
  account: WalletAccount;
};

export interface MidenClientOpts {
  endpoint?: string;
  noteTransportUrl?: string;
  seed?: Uint8Array;
  accountSeed?: string;
}

export interface MidenAccountOpts {
  type: AccountType;
  storageMode: AccountStorageMode;
}
