"use client";

import { useEffect, useMemo, useState } from "react";
import type { MidenClient } from "@miden-sdk/miden-sdk";
import type { Wallet } from "@turnkey/core";
import type { ClientContextType } from "@turnkey/react-wallet-kit";
import { useTurnkey } from "@turnkey/react-wallet-kit";
import { createMidenTurnkeyClient } from "@miden-sdk/miden-turnkey";

export interface UseTurnkeyMidenOpts {
  accountSeed?: string;
  noteTransportUrl?: string;
  endpoint?: string;
  organizationId?: string;
}

export interface UseTurnkeyMidenResult {
  client: MidenClient | null;
  accountId: string | null;
  turnkey: ClientContextType;
  embeddedWallets: Wallet[];
  nodeUrl: string;
  opts: UseTurnkeyMidenOpts;
}

export function useTurnkeyMiden(
  nodeUrl: string,
  storageMode: "public" | "private" = "public",
  opts: UseTurnkeyMidenOpts = {}
): UseTurnkeyMidenResult {
  const [client, setClient] = useState<MidenClient | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);

  const turnkey = useTurnkey();
  const { wallets, httpClient, session } = turnkey;

  const embeddedWallets = useMemo(
    () => wallets.filter((wallet) => wallet.source === "embedded"),
    [wallets]
  );

  useEffect(() => {
    if (embeddedWallets.length === 0) {
      setClient(null);
      setAccountId(null);
      return;
    }

    if (!httpClient) {
      console.warn("Turnkey HTTP client is not available");
      return;
    }

    const organizationId = opts.organizationId || session?.organizationId;
    if (!organizationId) {
      console.warn("No organization ID found");
      return;
    }

    let mounted = true;
    const loadClient = async () => {
      const { AccountType, AccountStorageMode } = await import(
        "@miden-sdk/miden-sdk"
      );

      const accountStorageMode =
        storageMode === "public"
          ? AccountStorageMode.public()
          : AccountStorageMode.private();

      const { client: midenClient, accountId: newAccountId } =
        await createMidenTurnkeyClient(
          {
            client: httpClient as any,
            account: embeddedWallets[0].accounts[0],
            organizationId,
          },
          {
            endpoint: opts.endpoint || nodeUrl,
            noteTransportUrl: opts.noteTransportUrl,
            accountSeed: opts.accountSeed,
            type: AccountType.RegularAccountImmutableCode,
            storageMode: accountStorageMode,
          }
        );

      if (mounted) {
        setClient(midenClient as any);
        setAccountId(newAccountId);
      }
    };

    loadClient().catch((err) => {
      console.error("Failed to load Miden client:", err);
    });

    return () => {
      mounted = false;
      client?.terminate();
      setClient(null);
      setAccountId(null);
    };
  }, [embeddedWallets, httpClient, session, nodeUrl, storageMode, opts.accountSeed, opts.noteTransportUrl, opts.endpoint, opts.organizationId]);

  return {
    client,
    accountId,
    turnkey,
    embeddedWallets,
    nodeUrl,
    opts,
  };
}
