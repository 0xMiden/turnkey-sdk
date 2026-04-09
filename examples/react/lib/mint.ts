import type React from "react";
import type { MidenClient } from "@miden-sdk/miden-sdk";
import { type MintAndConsumeProgress, MintAndConsumeStage } from "./types";
import { toast } from "sonner";

export async function createFaucetMintAndConsume(
  client: MidenClient,
  accountId: string,
  setProgress: React.Dispatch<
    React.SetStateAction<MintAndConsumeProgress | null>
  >
) {
  const { MidenClient: MidenClientClass } = await import(
    "@miden-sdk/miden-sdk"
  );
  setProgress({ stage: MintAndConsumeStage.CreatingFaucet });
  const faucetClient = await MidenClientClass.create({ autoSync: true });
  const faucet = await faucetClient.accounts.create({
    type: "FungibleFaucet",
    symbol: "MID",
    decimals: 8,
    maxSupply: BigInt(1_000_000_0000_00),
  });
  console.log("Created faucet with ID:", faucet.id().toString());
  setProgress((state) => ({
    ...state,
    stage: MintAndConsumeStage.CreatedFaucet,
    faucetId: faucet.id().toString(),
  }));
  await client.sync();
  setProgress((state) => ({
    ...state,
    stage: MintAndConsumeStage.MintingTokens,
  }));
  const mintResult = await faucetClient.transactions.mint({
    account: faucet,
    to: accountId,
    amount: BigInt(1000) * BigInt(1e8),
    type: "public",
  });
  console.log("Mint Tx Hash:", mintResult.txId.toHex());
  setProgress((state) => ({
    ...state,
    stage: MintAndConsumeStage.MintedTokens,
    mintTxHash: mintResult.txId.toHex(),
  }));
  await new Promise((resolve) => setTimeout(resolve, 10000));
  console.log("Proceeding to consume tokens...");
  setProgress((state) => ({
    ...state,
    stage: MintAndConsumeStage.ConsumingTokens,
  }));
  await client.sync();
  const consumeResult = await client.transactions.consumeAll({
    account: accountId,
  });
  await client.sync();
  console.log("Consume Tx Hash:", consumeResult.txId.toHex());
  setProgress((state) => ({
    ...state,
    stage: MintAndConsumeStage.ConsumedTokens,
    consumeTxHash: consumeResult.txId.toHex(),
  }));
  toast.success("Transaction Completed", {
    description: `Successfully minted and consumed tokens. Faucet ID: ${faucet
      .id()
      .toString()}`,
    action: {
      label: "View TX",
      onClick: () => {
        window.open(
          `https://testnet.midenscan.com/tx/${consumeResult.txId.toHex()}`,
          "_blank"
        );
      },
    },
  });
}
