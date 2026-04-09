import { isHttpClient, TurnkeyActivityError } from "@turnkey/http";
import type {
  MidenAccountOpts,
  MidenClientOpts,
  TConfig,
} from "./types";
import type {
  MidenClient,
  AccountType,
  AccountStorageMode,
} from "@miden-sdk/miden-sdk";
import {
  accountSeedFromStr,
  evmPkToCommitment,
  fromTurnkeySig,
} from "./utils.js";

const sign = async (
  messageHex: string,
  { client, organizationId, account }: TConfig
) => {
  let result;

  if (isHttpClient(client)) {
    console.time("turnkey signing");
    const { activity } = await client.signRawPayload({
      type: "ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2",
      organizationId: organizationId,
      timestampMs: String(Date.now()),
      parameters: {
        signWith: account.address,
        payload: messageHex,
        encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
        hashFunction: "HASH_FUNCTION_KECCAK256",
      },
    });
    console.timeEnd("turnkey signing");
    const { id, status, type } = activity;

    if (activity.status !== "ACTIVITY_STATUS_COMPLETED") {
      throw new TurnkeyActivityError({
        message: `Invalid activity status: ${activity.status}`,
        activityId: id,
        activityStatus: status,
        activityType: type,
      });
    }

    result = refineNonNull(activity?.result?.signRawPayloadResult);
  } else {
    console.time("turnkey signing");
    result = await client.signRawPayload({
      signWith: account.address,
      payload: messageHex,
      encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
      hashFunction: "HASH_FUNCTION_KECCAK256",
    });
    console.timeEnd("turnkey signing");
  }
  return result;
};

const signCb = (turnkeyConfig: TConfig) => {
  return async (_: Uint8Array, signingInputs: Uint8Array) => {
    const { SigningInputs } = await import("@miden-sdk/miden-sdk");
    const deSigningInputs = SigningInputs.deserialize(signingInputs);
    const message = deSigningInputs.toCommitment().toHex();
    const sig = await sign(message, turnkeyConfig);
    const sigBytes = fromTurnkeySig(sig);
    return sigBytes;
  };
};

function refineNonNull<T>(
  input: T | null | undefined,
  errorMessage?: string
): T {
  if (input == null) {
    throw new Error(errorMessage ?? `Unexpected ${JSON.stringify(input)}`);
  }
  return input;
}

export async function createMidenTurnkeyClient(
  turnkeyConfig: TConfig,
  opts: MidenClientOpts & MidenAccountOpts
): Promise<{
  client: MidenClient;
  accountId: string;
}> {
  const { MidenClient: MidenClientClass } = await import("@miden-sdk/miden-sdk");
  const client = await MidenClientClass.create({
    rpcUrl: opts.endpoint,
    noteTransportUrl: opts.noteTransportUrl,
    seed: opts.seed,
    keystore: {
      getKey: async () => undefined,
      insertKey: async () => {},
      sign: signCb(turnkeyConfig),
    },
    autoSync: true,
  });
  const accountId = await createAccont(
    client,
    opts.type,
    opts.storageMode,
    turnkeyConfig,
    opts
  );
  return { client, accountId };
}

export async function createAccont(
  midenClient: MidenClient,
  type: AccountType,
  storageMode: AccountStorageMode,
  config: TConfig,
  opts?: MidenClientOpts
) {
  const { account: turnkeyAccount } = config;
  const compressedPublicKey = turnkeyAccount.publicKey;
  if (!compressedPublicKey) {
    throw new Error("Failed to fetch uncompressed public key");
  }
  await midenClient.sync();
  const pkc = await evmPkToCommitment(compressedPublicKey);
  const { AccountBuilder, AccountComponent, AccountStorageMode } = await import(
    "@miden-sdk/miden-sdk"
  );
  const accountBuilder = new AccountBuilder(
    accountSeedFromStr(opts?.accountSeed) ?? new Uint8Array(32).fill(0)
  );

  const account = accountBuilder
    .withAuthComponent(
      AccountComponent.createAuthComponentFromCommitment(pkc, 1)
    )
    .accountType(type)
    .storageMode(storageMode)
    .withBasicWalletComponent()
    .build().account;
  // If the account already exists on-chain (e.g. public/network), hydrate it instead of
  // recreating a "new" account with zero commitment, which causes submission to fail.
  if (storageMode !== AccountStorageMode.private()) {
    try {
      await midenClient.accounts.import(account);
    } catch {
      // Import will fail for non-existent accounts; fall through to creation path.
    }
  }

  // check if account exists locally after the import attempt
  const existing = await midenClient.accounts.get(account.id());
  if (!existing) {
    await midenClient.accounts.insert({ account });
  }
  await midenClient.sync();
  return account.id().toString();
}
