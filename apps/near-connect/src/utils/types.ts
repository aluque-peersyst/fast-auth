// Adapted from HOT Labs' near-connect (https://github.com/hot-dao/near-selector), MIT License.
export type Network = "mainnet" | "testnet";

export interface AddFunctionCallKey_AllowMethods_AnyMethod {
    anyMethod: true;
}

export interface AddFunctionCallKey_AllowMethods_SelectMethods {
    anyMethod: false;
    methodNames: string[];
}

export type AddFunctionCallKey_AllowMethods = AddFunctionCallKey_AllowMethods_AnyMethod | AddFunctionCallKey_AllowMethods_SelectMethods;

export interface AddFunctionCallKey_GasAllowance_Unlimited {
    kind: "unlimited";
}

export interface AddFunctionCallKey_GasAllowance_Limited {
    kind: "limited";
    amount: string;
}

export type AddFunctionCallKey_GasAllowance = AddFunctionCallKey_GasAllowance_Unlimited | AddFunctionCallKey_GasAllowance_Limited;

export interface AddFunctionCallKeyParams {
    contractId: string;
    publicKey: string;
    allowMethods: AddFunctionCallKey_AllowMethods;
    gasAllowance?: AddFunctionCallKey_GasAllowance;
}

export interface SignInParams {
    network: Network;
    addFunctionCallKey?: AddFunctionCallKeyParams;
}

export interface SignMessageDuringSignInParams {
    message: string;
    recipient: string;
    nonce: Uint8Array;
    callbackUrl?: string;
}

export interface SignMessageParams extends SignMessageDuringSignInParams {
    network: Network;
    signerId?: string;
}

export interface SignedMessage {
    accountId: string;
    publicKey: string;
    signature: string;
}

export interface SignInAndSignMessageParams extends SignInParams {
    messageParams: SignMessageDuringSignInParams;
}
