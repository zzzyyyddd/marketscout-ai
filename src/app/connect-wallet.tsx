'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  formatUnits,
  http,
  type Address,
  type EIP1193Provider,
} from 'viem';
import { celo } from 'viem/chains';

const USDC = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C';

const publicClient = createPublicClient({
  chain: celo,
  transport: http('https://forno.celo.org'),
});

const balanceAbi = [{
  type: 'function',
  name: 'balanceOf',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ type: 'uint256' }],
  stateMutability: 'view',
}] as const;

type BrowserProvider = EIP1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void
  ) => void;
};

function getProvider(): BrowserProvider | undefined {
  if (typeof window === 'undefined') return undefined;

  return (window as Window & {
    ethereum?: BrowserProvider;
  }).ethereum;
}

export default function ConnectWallet() {
  const [address, setAddress] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [celoBalance, setCeloBalance] = useState<string>();
  const [usdcBalance, setUsdcBalance] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refreshBalances = useCallback(async (account: Address) => {
    const [native, stable] = await Promise.all([
      publicClient.getBalance({ address: account }),
      publicClient.readContract({
        address: USDC,
        abi: balanceAbi,
        functionName: 'balanceOf',
        args: [account],
      }),
    ]);

    setCeloBalance(formatEther(native));
    setUsdcBalance(formatUnits(stable, 6));
  }, []);

  useEffect(() => {
    const provider = getProvider();
    if (!provider?.on) return;

    const handleAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      const next = accounts?.[0];

      setAddress(next as Address | undefined);
      setCeloBalance(undefined);
      setUsdcBalance(undefined);

      if (next) {
        void refreshBalances(next as Address).catch(() => {
          setError('Unable to refresh wallet balances');
        });
      }
    };

    const handleChain = (...args: unknown[]) => {
      const value = args[0];
      if (typeof value === 'string') {
        setChainId(Number.parseInt(value, 16));
      }
    };

    provider.on('accountsChanged', handleAccounts);
    provider.on('chainChanged', handleChain);

    return () => {
      provider.removeListener?.('accountsChanged', handleAccounts);
      provider.removeListener?.('chainChanged', handleChain);
    };
  }, [refreshBalances]);

  async function connect() {
    const provider = getProvider();

    if (!provider) {
      setError('Install or enable MetaMask/Rabby first');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const wallet = createWalletClient({
        chain: celo,
        transport: custom(provider),
      });

      const [account] = await wallet.requestAddresses();

      if (!account) throw new Error('No wallet account selected');

      const currentChain = await wallet.getChainId();

      setAddress(account);
      setChainId(currentChain);

      await refreshBalances(account);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Connection failed'
      );
    } finally {
      setBusy(false);
    }
  }

  async function switchNetwork() {
    const provider = getProvider();
    if (!provider) return;

    setBusy(true);
    setError('');

    try {
      const wallet = createWalletClient({
        chain: celo,
        transport: custom(provider),
      });

      try {
        await wallet.switchChain({ id: celo.id });
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : '';

        if (!message.includes('4902') &&
            !message.toLowerCase().includes('unrecognized')) {
          throw cause;
        }

        await wallet.addChain({ chain: celo });
        await wallet.switchChain({ id: celo.id });
      }

      setChainId(celo.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Network switch failed'
      );
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    setAddress(undefined);
    setChainId(undefined);
    setCeloBalance(undefined);
    setUsdcBalance(undefined);
    setError('');
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {!address ? (
        <button
          type="button"
          onClick={connect}
          disabled={busy}
          className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
        >
          {busy ? 'Connecting...' : 'Connect Wallet'}
        </button>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-lg border border-white/15 px-3 py-2 text-xs">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
          {chainId !== celo.id ? (
            <button
              type="button"
              onClick={switchNetwork}
              disabled={busy}
              className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-slate-950"
            >
              Switch to Celo
            </button>
          ) : (
            <span className="text-xs text-emerald-400">Celo Mainnet</span>
          )}
          <button
            type="button"
            onClick={disconnect}
            className="text-xs text-slate-400 underline"
          >
            Disconnect
          </button>
        </div>
      )}

      {address && (
        <p className="text-xs text-slate-400">
          CELO: {celoBalance ?? '...'} · USDC: {usdcBalance ?? '...'}
        </p>
      )}

      {error && (
        <p role="alert" className="max-w-xs text-right text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
