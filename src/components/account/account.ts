import { fromHex } from '@mysten/bcs';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { type Keypair } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { Secp256r1Keypair } from '@mysten/sui/keypairs/secp256r1';
import { Transaction } from '@mysten/sui/transactions';
import {expect, jest, test} from '@jest/globals';
import { IdentifierArray, Wallet, WalletAccount, SUI_DEVNET_CHAIN, signTransaction, ReadonlyUint8Array } from '@mysten/wallet-standard';

export class Account implements WalletAccount {
    #keypair: Ed25519Keypair;
    public client: SuiClient;
    public network: "localnet" | "devnet" | "testnet" | "mainnet";
    public chains: IdentifierArray = [SUI_DEVNET_CHAIN];
    public features: IdentifierArray = [
        'sui:signTransactionBlock',
        'sui:signAndExecuteTransactionBlock'
    ] as const;
    public address: string;
    public publicKey: ReadonlyUint8Array;

    constructor(mnemonicPhrase: string, network: "localnet" | "devnet" | "testnet" | "mainnet") {
        this.#keypair = Ed25519Keypair.deriveKeypair(mnemonicPhrase);
        this.client = new SuiClient({url: getFullnodeUrl(this.network)});
        this.network = network;
        this.address = this.#keypair.toSuiAddress();
        this.publicKey = this.#keypair.getPublicKey().toRawBytes();
    }

    public getKeys(): Ed25519Keypair {
        return this.#keypair;
    }

    async getCoins(){
        const coins = await this.client.getCoins({owner: this.#keypair.toSuiAddress()})
        return coins
    }

}