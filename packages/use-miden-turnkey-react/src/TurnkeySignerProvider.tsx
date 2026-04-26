import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import {
  Turnkey,
  type TurnkeySDKBrowserConfig,
  SessionType,
} from "@turnkey/sdk-browser";
import type { TurnkeyBrowserClient } from "@turnkey/sdk-browser";
import type { WalletAccount } from "@turnkey/core";
import {
  SignerContext,
  type SignerContextValue,
  type SignerAccountConfig,
} from "@miden-sdk/react/lazy";
import { evmPkToCommitment, fromTurnkeySig } from "@miden-sdk/miden-turnkey/lazy";

// TURNKEY SIGNER PROVIDER
// ================================================================================================

export interface TurnkeySignerProviderProps {
  children: ReactNode;
  /** Turnkey SDK browser configuration (defaultOrganizationId is required; apiBaseUrl defaults to https://api.turnkey.com) */
  config: Pick<TurnkeySDKBrowserConfig, "defaultOrganizationId"> &
    Partial<Omit<TurnkeySDKBrowserConfig, "defaultOrganizationId">>;
  /** Optional custom account components to include in the account (e.g. from a compiled .masp package) */
  customComponents?: SignerAccountConfig["customComponents"];
  /** Optional account ID to import instead of creating a new account */
  importAccountId?: string;
}

/**
 * Turnkey-specific extras exposed via useTurnkeySigner hook.
 */
export interface TurnkeySignerExtras {
  /** Turnkey browser client instance (null if not yet connected) */
  client: TurnkeyBrowserClient | null;
  /** Connected account (null if not connected) */
  account: WalletAccount | null;
}

const TurnkeySignerExtrasContext = createContext<TurnkeySignerExtras | null>(
  null,
);

/**
 * Signs a message using Turnkey's signRawPayload API.
 */
async function signWithTurnkey(
  messageHex: string,
  client: TurnkeyBrowserClient,
  account: WalletAccount,
): Promise<{ r: string; s: string; v: string }> {
  const result = await client.signRawPayload({
    signWith: account.address,
    payload: messageHex,
    encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
    hashFunction: "HASH_FUNCTION_KECCAK256",
  });
  return result;
}

/**
 * Pattern B: arbitrary-byte signing for `useSignBytes`.
 *
 * Same shape as Para's `signBytes`:
 *   - 'word'         → bytes ARE a serialized 32-byte Miden Word.
 *   - 'signingInputs' → extract the commitment Word via `inputs.toCommitment()`.
 * Both kinds: the Word's hex is sent to Turnkey with KECCAK256 (server-side
 * hashing), matching the wallet's `Vault.signData` semantics. Verified
 * against `~/miden/miden-wallet/src/lib/miden/back/vault.ts:476-500`.
 */
async function signBytesWithTurnkey(
  data: Uint8Array,
  kind: "word" | "signingInputs",
  client: TurnkeyBrowserClient,
  account: WalletAccount,
): Promise<Uint8Array> {
  const { SigningInputs, Word } = await import("@miden-sdk/miden-sdk/lazy");
  const word: any =
    kind === "word"
      ? Word.deserialize(data)
      : SigningInputs.deserialize(data).toCommitment();
  const sig = await signWithTurnkey(word.toHex(), client, account);
  return fromTurnkeySig(sig);
}

/**
 * TurnkeySignerProvider wraps MidenProvider to enable Turnkey wallet signing.
 * Constructs a TurnkeyBrowserClient internally from the provided config.
 *
 * @example
 * ```tsx
 * <TurnkeySignerProvider config={{ apiBaseUrl: "https://api.turnkey.com", organizationId: "your-org-id", stamper }}>
 *   <MidenProvider config={{ rpcUrl: "testnet" }}>
 *     <App />
 *   </MidenProvider>
 * </TurnkeySignerProvider>
 * ```
 */
const TURNKEY_DEFAULTS = {
  apiBaseUrl: "https://api.turnkey.com",
};

export function TurnkeySignerProvider({
  children,
  config,
  customComponents,
  importAccountId,
}: TurnkeySignerProviderProps) {
  const resolvedConfig: TurnkeySDKBrowserConfig = {
    ...TURNKEY_DEFAULTS,
    ...config,
  };

  const turnkey = useMemo(
    () => new Turnkey(resolvedConfig),
    [resolvedConfig.apiBaseUrl, resolvedConfig.defaultOrganizationId],
  );

  const [client, setClient] = useState<TurnkeyBrowserClient | null>(null);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Connect/disconnect methods (stable references)
  const connect = useCallback(async () => {
    // 1. Create IndexedDB client and initialize its keypair
    const indexedDbClient = await turnkey.indexedDbClient();
    await indexedDbClient.init();

    // 2. Only login if no existing session
    const existingSession = await turnkey.getSession();
    if (!existingSession) {
      const passkeyClient = turnkey.passkeyClient();
      await passkeyClient.loginWithPasskey({
        sessionType: SessionType.READ_WRITE,
        publicKey: (await indexedDbClient.getPublicKey())!,
      });
    }

    // 3. Get wallets (using the now-authenticated indexedDbClient)
    const { wallets } = await indexedDbClient.getWallets();
    if (!wallets.length) throw new Error("No wallets found");

    // 4. Get accounts from first wallet
    const { accounts } = await indexedDbClient.getWalletAccounts({
      walletId: wallets[0].walletId,
    });
    if (!accounts.length) throw new Error("No accounts found");

    // 5. Select first Ethereum-format account
    const acct =
      accounts.find((a) => a.addressFormat === "ADDRESS_FORMAT_ETHEREUM") ??
      accounts[0];

    // 6. Set connected
    setClient(indexedDbClient);
    setAccount(acct as WalletAccount);
    setIsConnected(true);
  }, [turnkey]);

  const disconnect = useCallback(async () => {
    setAccount(null);
    setIsConnected(false);
  }, []);

  // Allow external setting of account (for apps that handle auth themselves)
  const setConnectedAccount = useCallback((acc: WalletAccount | null) => {
    setAccount(acc);
    setIsConnected(acc !== null);
  }, []);

  // Build signer context
  const [signerContext, setSignerContext] = useState<SignerContextValue | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function buildContext() {
      if (!isConnected || !account) {
        // Not connected - provide context with connect/disconnect but no signing capability
        setSignerContext({
          signCb: async () => {
            throw new Error("Turnkey wallet not connected");
          },
          accountConfig: null as any,
          storeName: "",
          name: "Turnkey",
          isConnected: false,
          connect,
          disconnect,
        });
        return;
      }

      try {
        // Connected - build full context with signing capability
        const compressedPublicKey = account.publicKey;
        if (!compressedPublicKey) {
          throw new Error("Account has no public key");
        }

        const commitment = await evmPkToCommitment(compressedPublicKey);
        const commitmentBytes = commitment.serialize();

        const signCb = async (_: Uint8Array, signingInputs: Uint8Array) => {
          if (!client) throw new Error("Turnkey client not available");
          const { SigningInputs } = await import("@miden-sdk/miden-sdk/lazy");
          const inputs = SigningInputs.deserialize(signingInputs);
          const messageHex = inputs.toCommitment().toHex();

          const sig = await signWithTurnkey(messageHex, client, account);
          return fromTurnkeySig(sig);
        };

        if (!cancelled) {
          const { AccountStorageMode } = await import("@miden-sdk/miden-sdk/lazy");

          // Pattern B: arbitrary-byte signing for `useSignBytes`. Turnkey can
          // sign any payload — we just generalize signWithTurnkey for both
          // `kind` values and route them through the same KECCAK256 path.
          const signBytes = async (
            data: Uint8Array,
            kind: "word" | "signingInputs"
          ) => {
            if (!client) throw new Error("Turnkey client not available");
            return signBytesWithTurnkey(data, kind, client, account);
          };

          setSignerContext({
            signCb,
            signBytes,
            accountConfig: {
              publicKeyCommitment: commitmentBytes,
              accountType: "RegularAccountImmutableCode",
              storageMode: AccountStorageMode.public(),
              ...(customComponents?.length ? { customComponents } : {}),
              ...(importAccountId ? { importAccountId } : {}),
            },
            storeName: `turnkey_${account.address}`,
            name: "Turnkey",
            isConnected: true,
            connect,
            disconnect,
          });
        }
      } catch (error) {
        console.error("Failed to build Turnkey signer context:", error);
        if (!cancelled) {
          setSignerContext({
            signCb: async () => {
              throw new Error("Turnkey wallet not connected");
            },
            accountConfig: null as any,
            storeName: "",
            name: "Turnkey",
            isConnected: false,
            connect,
            disconnect,
          });
        }
      }
    }

    buildContext();
    return () => {
      cancelled = true;
    };
  }, [isConnected, account, client, connect, disconnect, importAccountId]);

  // Extended extras context with setAccount
  const extrasValue = useMemo(
    () => ({
      client,
      account,
      setAccount: setConnectedAccount,
    }),
    [client, account, setConnectedAccount],
  );

  return (
    <TurnkeySignerExtrasContext.Provider value={extrasValue}>
      <SignerContext.Provider value={signerContext}>
        {children}
      </SignerContext.Provider>
    </TurnkeySignerExtrasContext.Provider>
  );
}

/**
 * Hook for Turnkey-specific extras beyond the unified useSigner interface.
 * Use this to access the Turnkey client or set the account.
 *
 * @example
 * ```tsx
 * const { client, account, setAccount, isConnected } = useTurnkeySigner();
 *
 * // After Turnkey auth flow completes:
 * setAccount(walletAccount);
 * ```
 */
export function useTurnkeySigner(): TurnkeySignerExtras & {
  isConnected: boolean;
  setAccount: (account: WalletAccount | null) => void;
} {
  const extras = useContext(TurnkeySignerExtrasContext) as
    | (TurnkeySignerExtras & {
        setAccount: (account: WalletAccount | null) => void;
      })
    | null;
  const signer = useContext(SignerContext);
  if (!extras) {
    throw new Error(
      "useTurnkeySigner must be used within TurnkeySignerProvider",
    );
  }
  return { ...extras, isConnected: signer?.isConnected ?? false };
}
