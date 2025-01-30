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

class Account implements WalletAccount {
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
    private client: SuiClient = new SuiClient({url: getFullnodeUrl("devnet")});

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

    protected checkAccount() {
        if(!this.currentAccount){
            throw new Error("No selected account error");
        }
    }

    private signPersonalMessage: SuiSignPersonalMessageMethod = async ({message}) => {
        const signatureMessage = await this.currentAccount?.getKeypair().signPersonalMessage(message);

        if(!signatureMessage){
            throw new Error("Failed signature");
        }

        return {
            bytes: Buffer.from(message).toString("base64"),
            signature: Buffer.from(signatureMessage.signature).toString("base64")
        }
    }


    private signTransaction: SuiSignTransactionMethod = async ({transaction}) => {
        const txJson = await transaction.toJSON();

        const tx = Transaction.from(txJson);

        const txBytes = await tx.build({client: this.client});
        const signatureTx = await this.currentAccount?.getKeypair().signTransaction(txBytes);

        console.log(await tx.getData())

        if(!signatureTx){
            throw new Error("Failed signature tx")
        }
        return {
            bytes: Buffer.from(await transaction.toJSON()).toString("base64"),
            signature: Buffer.from(signatureTx?.signature).toString("base64")
        }
    }

    private signAndExecuteTransaction: SuiSignAndExecuteTransactionMethod = async ({transaction}) => {
        const txJson = await transaction.toJSON();

        const tx = Transaction.from(txJson);

        const txBytes = await tx.build({client: this.client});
        const signature = await this.currentAccount?.getKeypair().signTransaction(txBytes);

        console.log(await tx.getData())

        if(!signature){
            throw new Error("Failed signature tx")
        }

        const signatureBytes = new Uint8Array(1 + signature.signature.length);

        const verifyTx = await this.currentAccount?.getKeypair().getPublicKey().verifyTransaction(txBytes, await signature.signature);
        if(!verifyTx){
            throw new Error("Failed verify transaction");
        }

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
        
        if(!this.currentAccount.getKeypair().getPublicKey().verifyTransaction(tx_bytes, serializedSignature.signature)){
            throw new Error("Error verify transaction");
        }

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
        
        if(!this.currentAccount.getKeypair().getPublicKey().verifyTransaction(tx_bytes, serializedSignature.signature)){
            throw new Error("Error verify transaction");
        }

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

    private reportTransactionEffects: SuiReportTransactionEffectsMethod = async ({effects}) => {
        //report
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

    changeChain(chain: string): void {
        this.currentChain = chain;
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
            "sui_signAndExecuteTransaction": this.signAndExecuteTransaction,
            "sui_reportTransactionEffects": this.reportTransactionEffects,
        };
    }
}
