import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair, Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import {
    SUI_DEVNET_CHAIN,
    SUI_LOCALNET_CHAIN,
    SUI_TESTNET_CHAIN,
    SUI_MAINNET_CHAIN,
    ConnectFeature,
    ConnectMethod,
    EventsFeature,
    EventsOnMethod,
    SuiFeatures,
    SuiSignPersonalMessageMethod,
    SuiSignTransactionMethod,
    SuiSignAndExecuteTransactionMethod,
    SuiReportTransactionEffectsMethod,
    Wallet,
    IdentifierArray,
    WalletAccount,
    ReadonlyUint8Array
} from "@mysten/wallet-standard"

interface ExecuteTransaction {
    bytes: string,
    signature: string,
    publicKey: Ed25519PublicKey
}

export class Account implements WalletAccount {
    address: string;
    publicKey: ReadonlyUint8Array;
    chains: IdentifierArray;
    features: IdentifierArray;
    label?: string | undefined;
    icon?: `data:image/svg+xml;base64,${string}` | `data:image/webp;base64,${string}` | `data:image/png;base64,${string}` | `data:image/gif;base64,${string}` | undefined;
    private keypair: Ed25519Keypair;

    constructor(keypair: Ed25519Keypair) {
        this.address = keypair.toSuiAddress()
        this.publicKey = keypair.getPublicKey().toRawBytes(),
        this.chains = [SUI_DEVNET_CHAIN, SUI_LOCALNET_CHAIN, SUI_TESTNET_CHAIN, SUI_MAINNET_CHAIN]
        this.features = [],
        this.keypair = keypair
    }

    public getKeypair(): Ed25519Keypair {
        return this.keypair;
    }    
}

type WalletFeatures = {
    "sui_signPersonalMessage": SuiSignPersonalMessageMethod;
    "sui_signTransaction": SuiSignTransactionMethod;
    "sui_signAndExecuteTransaction": SuiSignAndExecuteTransactionMethod;
    "sui_reportTransactionEffects": SuiReportTransactionEffectsMethod;
};

export default class UDO_Wallet implements Wallet {
    id?: string | undefined;
    private walletAccounts: Account[] = []
    public accounts: readonly WalletAccount[] = [];
    private currentAccount: Account | null = null;
    private currentChain = SUI_DEVNET_CHAIN
    private client: SuiClient;

    get version(): "1.0.0" {
        return "1.0.0";
    }

    get name(): string {
        return "UDO_";
    }

    get icon(): `data:image/svg+xml;base64,${string}` | `data:image/webp;base64,${string}` | `data:image/png;base64,${string}` | `data:image/gif;base64,${string}` {
        return "data:image/png;base64,${string}";
    }

    get chains(): IdentifierArray {
        return [SUI_DEVNET_CHAIN, SUI_LOCALNET_CHAIN, SUI_TESTNET_CHAIN, SUI_MAINNET_CHAIN];
    }

    constructor() {
        this.client = new SuiClient({
            url: getFullnodeUrl(this.networkMap[SUI_DEVNET_CHAIN])
        });
    }

    private networkMap = {
        [SUI_DEVNET_CHAIN]: "devnet" as const,
        [SUI_LOCALNET_CHAIN]: "localnet" as const,
        [SUI_TESTNET_CHAIN]: "testnet" as const,
        [SUI_MAINNET_CHAIN]: "mainnet" as const
    }

    private updateClient(network: keyof typeof this.networkMap) {
        const networkType = this.networkMap[network];
        if (!networkType) throw new Error("Unsupported network");
    
        this.client = new SuiClient({
            url: getFullnodeUrl(networkType)
        });
    }

    private signPersonalMessage: SuiSignPersonalMessageMethod = async ({message}) => {
        const signatureMessage = await this.currentAccount?.getKeypair().signPersonalMessage(message);

        if(!signatureMessage){
            throw new Error("Failed signature");
        }

        return signatureMessage;
    }


    private signTransaction: SuiSignTransactionMethod = async ({transaction}) => {
        const txJson = await transaction.toJSON();
        const tx = Transaction.from(txJson);
        const txBytes = await tx.build({client: this.client});
        const signatureTx = await this.currentAccount?.getKeypair().signTransaction(txBytes);
        if(!signatureTx){
            throw new Error("Error signature")
        }

        this.verifyTransaction(txBytes, signatureTx.signature);
        return signatureTx!
    }

    private signAndExecuteTransaction: SuiSignAndExecuteTransactionMethod = async ({transaction}) => {
        const txJson = await transaction.toJSON();
        const tx = Transaction.from(txJson);
        const txBytes = await tx.build({client: this.client});
        const signature = await this.currentAccount?.getKeypair().signTransaction(txBytes);
        if(!signature){
            throw new Error("Failed verify transaction");
        }

        this.verifyTransaction(txBytes, signature.signature)

        let res = await this.client.executeTransactionBlock({
            transactionBlock: txBytes,
            signature: signature.signature
        })

        return {
            bytes: Buffer.from(txBytes).toString("base64"),
            signature: Buffer.from(signature.signature).toString("base64"),
            digest: res.digest,
            effects: res.effects ? JSON.stringify(res.effects): ""
        }
    }

    public async buildTransaction(recipientAddress: string, amount: number): Promise<ExecuteTransaction> {
        if(!this.currentAccount){
            throw new Error("No selected account error");
        }

        const tx = new Transaction();
        tx.setSender(this.currentAccount?.getKeypair().toSuiAddress());
        tx.setGasPrice(1000);
        tx.setGasBudget(100000000);
        const [coin] = tx.splitCoins(tx.gas, [amount]);
        tx.transferObjects([coin], recipientAddress);

        const tx_bytes = await tx.build({client: this.client})
        const serializedSignature = await this.currentAccount.getKeypair().signTransaction(tx_bytes);
        
        this.verifyTransaction(tx_bytes, serializedSignature.signature);

        return {
            bytes: Buffer.from(tx_bytes).toString("base64"),
            signature: Buffer.from(serializedSignature.signature).toString("base64"),
            publicKey: this.currentAccount.getKeypair().getPublicKey()
        }

    }

    public async buildAndExecuteTransaction(recipientAddress: string, amount: number): Promise<ExecuteTransaction> {
        if(!this.currentAccount){
            throw new Error("No selected account error");
        }

        const tx = new Transaction();
        tx.setSender(this.currentAccount?.getKeypair().toSuiAddress());
        tx.setGasPrice(1000);
        tx.setGasBudget(100000000);
        const [coin] = tx.splitCoins(tx.gas, [amount]);
        tx.transferObjects([coin], recipientAddress);

        const tx_bytes = await tx.build({client: this.client})
        const serializedSignature = await this.currentAccount.getKeypair().signTransaction(tx_bytes);
        
        this.verifyTransaction(tx_bytes, serializedSignature.signature)

        let resultTx = await this.client.executeTransactionBlock({
            transactionBlock: tx_bytes,
            signature: serializedSignature.signature
        })

        return {
            bytes: Buffer.from(tx_bytes).toString("base64"),
            signature: Buffer.from(serializedSignature.signature).toString("base64"),
            publicKey: this.currentAccount.getKeypair().getPublicKey()
        }
    }


    private verifyTransaction(txBytes: Uint8Array, signature: Uint8Array | string) {
        if (!this.currentAccount?.getKeypair().getPublicKey().verifyTransaction(txBytes, signature)) {
            throw new Error("Transaction verification failed");
        }
    }

    addAccount(privateKey: string): void {
        const account = this.createAccountFromPrivateKey(privateKey);
        this.walletAccounts.push(account);
        this.accounts = [...this.walletAccounts]
        
        if(!this.currentAccount) {
            this.currentAccount =  account;
        }

    }

    removeAccount(address: string): void {
        this.walletAccounts = this.walletAccounts.filter(account => account.getKeypair().toSuiAddress() !== address);
        if(this.currentAccount?.getKeypair().toSuiAddress() === address) {
            this.currentAccount = this.walletAccounts[0] || null;
        }
    }

    changeAccount(account: Account): void {
        if(this.walletAccounts.includes(account)) {
            this.currentAccount = account;
        }
    }

    changeChain(chain: keyof typeof this.networkMap): void {
        if (!(chain in this.networkMap)) {
            throw new Error("Unsupported chain");
        }
        
        this.currentChain = chain;
        this.updateClient(chain);
        
        this.walletAccounts.forEach(acc => {
            acc.chains = [chain];
        });
    }

    public getCurrentNetwork(): string {
        return this.currentChain;
    }

    private createAccountFromPrivateKey(privateKey: string):  Account {
        const keypair = Ed25519Keypair.fromSecretKey(privateKey)
        return new Account(keypair);
    }

    public getCurrentAccount(): Account {
        return this.currentAccount!;
    }

    public getClient(): SuiClient {
        return this.client;
    }

    public getChain() {
        return this.currentChain;
    }

    get features() {
        return {
            "sui_signPersonalMessage": this.signPersonalMessage,
            "sui_signTransaction": this.signTransaction,
            "sui_signAndExecuteTransaction": this.signAndExecuteTransaction
        };
    }
}
