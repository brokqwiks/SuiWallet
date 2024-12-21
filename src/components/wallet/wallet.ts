import { fromHex } from '@mysten/bcs';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { type Keypair } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { Secp256r1Keypair } from '@mysten/sui/keypairs/secp256r1';
import { Transaction } from '@mysten/sui/transactions';
import {expect, jest, test} from '@jest/globals';
import { IdentifierArray, Wallet, WalletAccount, SUI_DEVNET_CHAIN, signTransaction } from '@mysten/wallet-standard';
import { Account } from '../account/account';

export class SuiWallet implements Wallet {
    private client: SuiClient;
    private network: "localnet" | "devnet" | "testnet" | "mainnet";

    public version: '1.0.0' = "1.0.0";
    public name: string = "UDO_";
    public chains: IdentifierArray = [SUI_DEVNET_CHAIN];
    public icon: `data:image/svg+xml;base64,${string}` | `data:image/webp;base64,${string}` | `data:image/png;base64,${string}` | `data:image/gif;base64,${string}`; 
    public features: Readonly<Record<`${string}:${string}`, unknown>> = {
        'sui:signTransactionBlock': true,
        'sui:signAndExecuteTransactionBlock': true
    } as const;
    public _accounts: readonly WalletAccount[] = [];

    public get accounts(): readonly WalletAccount[] {
        return this._accounts;
    }

    constructor(network: "localnet" | "devnet" | "testnet" | "mainnet") {
        this.network = "devnet";
        this.client = new SuiClient({url: getFullnodeUrl(this.network)});
        this.icon = `data:image/png;base64,${"udo_icon"}`;
    }

    public addAccount(mnemonicPhrase: string): Account {
        const newAccount = new Account(mnemonicPhrase, this.network);
        this._accounts = [...this._accounts, newAccount];
        return newAccount;
    }

    public removeAccount(address: string): void {
        this._accounts = this._accounts.filter(account => account.address !== address);
    }

    public getAccountByAddress(address: string): WalletAccount | undefined {
        return this._accounts.find(account => account.address === address);
    }

    async signPersonalMessage(account: Account, message: string): Promise<string> {
        const encoder = new TextEncoder
        const { signature } = await account.getKeys().signPersonalMessage(encoder.encode(message));
        return signature;
    }

    async signMessageAndSend(account: Account, recipient: string, amount: number) {
        const txb = new Transaction();
        txb.setSender(account.getKeys().toSuiAddress());
        txb.setGasPrice(10000);
        txb.setGasBudget(100000000);
        const [coin] = txb.splitCoins(txb.gas, [amount]);
        txb.transferObjects([coin], recipient)

        const txb_bytes = await txb.build({client: this.client});
        const serializedSignature = (await account.getKeys().signTransaction(txb_bytes)).signature
        const verify = await account.getKeys().getPublicKey().verifyTransaction(txb_bytes, serializedSignature);

        let res = await this.client.executeTransactionBlock({
            transactionBlock: txb_bytes,
            signature: serializedSignature,
        })

        return serializedSignature;
    }
}