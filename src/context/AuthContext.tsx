"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { Connector, useConnect, useDisconnect } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { createAppKit } from "@reown/appkit";
import { mainnet, sepolia, base, bsc } from "@reown/appkit/networks";
import { useAppKitAccount } from "@reown/appkit/react";
import Cookies from "js-cookie";
import {
  createConfig,
  http,
  cookieStorage,
  createStorage,
} from "wagmi";
import { wagmiAdapter, projectId } from "../lib/config";

// Function to create Wagmi config
export function wagmiConfig() {
  return createConfig({
    chains: [mainnet, sepolia],
    ssr: true,
    storage: createStorage({
      storage: cookieStorage,
    }),
    transports: {
      [mainnet.id]: http(),
      [sepolia.id]: http(),
    },
  });
}

export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks: [mainnet, base, bsc],
  defaultNetwork: mainnet,
});

const queryClient = new QueryClient();

export interface AuthContextType {
  walletAddress: string | null;
  accountIdentifier: string | null;
  blockchainWallet: string | null;
  isConnecting: boolean;
  isConnected: boolean;
  connect: (options: { connector: Connector; chainId?: number }) => Promise<void>;
  disconnect: () => Promise<void>;
  connectors: readonly Connector[];
  setAccountIdentifier: (accountIdentifier: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { connect, connectors } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { address, isConnected, caipAddress } = useAppKitAccount();

  const [isConnecting, setIsConnecting] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(
    () => Cookies.get("walletAddress") || null
  );
  const [accountIdentifier, setAccountIdentifier] = useState<string | null>(
    () => Cookies.get("accountIdentifier") || null
  );
  const [blockchainWallet, setBlockchainWallet] = useState<string | null>(null);

  // Reconnect wallet if connection state exists in localStorage
  useEffect(() => {
    const reconnect = async () => {
      const state = localStorage.getItem("walletConnectState") || "";
      console.log("Reconnect state from localStorage:", state);
      if (!isConnected && state === "true") {
        const readyConnector = connectors.find((connector) => connector.ready);
        if (readyConnector) {
          try {
            console.log("Attempting to reconnect using:", readyConnector.name);
            await connect({ connector: readyConnector });
            console.log("Reconnected successfully with:", readyConnector.name);
          } catch (error) {
            console.error("Reconnection failed:", error);
          }
        } else {
          console.log("No ready connector available for reconnection.");
        }
      }
    };

    reconnect();
  }, [isConnected, connect, connectors]);

  // Save isConnected state to localStorage
  useEffect(() => {
    console.log("Connection state updated. isConnected:", isConnected);
    if (walletAddress && isConnected) {
      console.log("Saving walletConnectState as true in localStorage.");
      localStorage.setItem("walletConnectState", "true");
    } else {
      console.log("Removing walletConnectState from localStorage.");
      localStorage.removeItem("walletConnectState");
    }
  }, [walletAddress, isConnected]);

  const handleConnect = async (options: { connector: Connector; chainId?: number }) => {
    setIsConnecting(true);
    try {
      console.log("Connecting wallet...");
      await connect(options);
      console.log("Wallet connected successfully:", options.connector.name);
    } catch (error) {
      console.error("Error during wallet connection:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    console.log("Disconnecting wallet...");
    try {
      await wagmiDisconnect();
      setWalletAddress(null);
      setAccountIdentifier(null);
      setBlockchainWallet(null);
      Cookies.remove("walletAddress");
      Cookies.remove("accountIdentifier");
      localStorage.removeItem("walletConnectState");
      console.log("Wallet disconnected successfully.");
    } catch (error) {
      console.error("Error during wallet disconnection:", error);
    }
  };

  useEffect(() => {
    if (isConnected && address) {
      setWalletAddress(address);
      Cookies.set("walletAddress", address, { expires: 7 });

      if (!accountIdentifier) {
        const generatedAccountId = `user-${crypto.randomUUID()}`;
        setAccountIdentifier(generatedAccountId);
        Cookies.set("accountIdentifier", generatedAccountId, { expires: 7 });
      }

      const chainId = caipAddress?.split(":")[1] || null;
      setBlockchainWallet(`${chainId}:${address}`);
      console.log("Wallet details updated:", {
        walletAddress: address,
        accountIdentifier,
        blockchainWallet: `${chainId}:${address}`,
      });
    }
  }, [isConnected, address, caipAddress, accountIdentifier]);

  const [config2] = useState(() => wagmiConfig());
  return (
    <WagmiProvider config={config2}>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider
          value={{
            walletAddress,
            accountIdentifier,
            blockchainWallet,
            isConnected,
            disconnect: handleDisconnect,
            connectors,
            connect: handleConnect,
            isConnecting,
            setAccountIdentifier,
          }}
        >
          {children}
        </AuthContext.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
};
