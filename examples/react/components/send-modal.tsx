"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ActionButton } from "./action-button";
import { Send as SendIcon, X } from "lucide-react";
import { getBalance } from "@/lib/balance";

interface SendModalProps {
  onSend: (
    toAddress: string,
    faucetId: string,
    amount: string
  ) => Promise<{
    txHash: string;
  } | void>;
  onClose: () => void;
  accountId: string;
}

export function SendModal({ onSend, onClose, accountId }: SendModalProps) {
  const [toAddress, setToAddress] = useState("");
  const [faucetId, setFaucetId] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultData, setResultData] = useState<{
    txHash: string;
    elapsed: number;
  } | null>(null);
  const [faucetIdsAndBalance, setFaucetIdsAndBalance] = useState<
    {
      assetId: string;
      balance: string;
    }[]
  >([]);
  useEffect(() => {
    async function fetchBalances() {
      const balances = await getBalance(accountId);
      setFaucetIdsAndBalance(balances);
    }
    fetchBalances();
  }, [accountId]);

  const handleSend = async () => {
    if (!toAddress || !faucetId || !amount) return;

    setLoading(true);
    const start = performance.now();
    try {
      const result = await onSend(toAddress, faucetId, amount);
      if (result) {
        setResultData({
          txHash: result.txHash,
          elapsed: performance.now() - start,
        });
      }
    } catch (error) {
      console.error("Send failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-lg border-primary/30 shadow-2xl shadow-primary/10"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="font-mono text-lg flex items-center gap-2">
                <SendIcon className="h-5 w-5 text-primary" />
                SEND TOKENS
              </CardTitle>
              <CardDescription className="font-mono text-xs mt-1">
                Transfer assets to another address
              </CardDescription>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wide">
              Recipient Address
            </label>
            <input
              type="text"
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              className="w-full p-3 border border-border bg-muted/50 font-mono text-sm focus:outline-none focus:border-primary transition-colors"
              placeholder="0x..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wide">
              Faucet ID
            </label>
            <select
              value={faucetId}
              onChange={(e) => setFaucetId(e.target.value)}
              className="w-full p-3 border border-border bg-muted/50 font-mono text-sm focus:outline-none focus:border-primary transition-colors"
            >
              <option value="">Select Faucet</option>
              {faucetIdsAndBalance.map(({ assetId, balance }) => (
                <option key={assetId} value={assetId}>
                  {assetId} (Balance: {balance})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wide">
              Amount
            </label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full p-3 border border-border bg-muted/50 font-mono text-sm focus:outline-none focus:border-primary transition-colors"
              placeholder="0.00"
            />
          </div>

          {resultData && (
            <div className="border border-primary/30 bg-muted/30 p-4 space-y-3">
              <div className="text-xs font-mono text-primary uppercase tracking-wide flex items-center gap-2">
                <div className="w-2 h-2 bg-primary animate-pulse" />
                TRANSACTION COMPLETED
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-muted-foreground">TX Hash:</span>
                  <span className="text-primary break-all ml-2">
                    {resultData.txHash.slice(0, 12)}...
                    {resultData.txHash.slice(-8)}
                  </span>
                </div>
                <div className="flex justify-between text-xs font-mono border-t border-primary/20 pt-1.5 mt-1.5">
                  <span className="text-primary">Total Time:</span>
                  <span className="text-primary font-bold">
                    {resultData.elapsed.toFixed(2)} ms
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            {!resultData ? (
              <>
                <ActionButton
                  onClick={handleSend}
                  disabled={!toAddress || !faucetId || !amount}
                  loading={loading}
                  variant="default"
                  icon={<SendIcon className="h-4 w-4" />}
                >
                  SEND
                </ActionButton>
                <ActionButton onClick={onClose} variant="outline">
                  CANCEL
                </ActionButton>
              </>
            ) : (
              <ActionButton onClick={onClose} variant="default">
                CLOSE
              </ActionButton>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
