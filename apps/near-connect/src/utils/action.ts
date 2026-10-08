// Adapted from HOT Labs' near-connect (https://github.com/hot-dao/near-selector), MIT License.
// @ts-ignore - BN.js doesn't have proper ESM types
import BN from "bn.js";
import { transactions as nearApiTransactions, utils as nearApiUtils } from "near-api-js";

export interface CreateAccountAction {
    type: "CreateAccount";
}

export interface DeployContractAction {
    type: "DeployContract";
    params: { code: Uint8Array };
}

export interface FunctionCallAction {
    type: "FunctionCall";
    params: {
        methodName: string;
        args: object;
        gas: string;
        deposit: string;
    };
}

export interface TransferAction {
    type: "Transfer";
    params: { deposit: string };
}

export interface StakeAction {
    type: "Stake";
    params: {
        stake: string;
        publicKey: string;
    };
}

export type AddKeyPermission =
    | "FullAccess"
    | {
          receiverId: string;
          allowance?: string;
          methodNames?: Array<string>;
      };

export interface AddKeyAction {
    type: "AddKey";
    params: {
        publicKey: string;
        accessKey: {
            nonce?: number;
            permission: AddKeyPermission;
        };
    };
}

export interface DeleteKeyAction {
    type: "DeleteKey";
    params: { publicKey: string };
}
export interface DeleteAccountActionParams {
    beneficiaryId: string;
}
export interface DeleteAccountAction {
    type: "DeleteAccount";
    params: DeleteAccountActionParams;
}

export interface UseGlobalContractAction {
    type: "UseGlobalContract";
    params: { contractIdentifier: { accountId: string } | { codeHash: string } };
}

export interface DeployGlobalContractAction {
    type: "DeployGlobalContract";
    params: { code: Uint8Array; deployMode: "CodeHash" | "AccountId" };
}

export type ConnectorAction =
    | CreateAccountAction
    | DeployContractAction
    | FunctionCallAction
    | TransferAction
    | StakeAction
    | AddKeyAction
    | DeleteKeyAction
    | DeleteAccountAction
    | UseGlobalContractAction
    | DeployGlobalContractAction;

const createNearApiJsAction = (action: ConnectorAction): any => {
    switch (action.type) {
        case "CreateAccount":
            return nearApiTransactions.createAccount();
        case "DeployContract": {
            const { code } = action.params;
            return nearApiTransactions.deployContract(code);
        }
        case "FunctionCall": {
            const { methodName, args, gas, deposit } = action.params;
            return nearApiTransactions.functionCall(methodName, args, new BN(gas) as any, new BN(deposit) as any);
        }
        case "Transfer": {
            const { deposit } = action.params;
            return nearApiTransactions.transfer(new BN(deposit) as any);
        }
        case "Stake": {
            const { stake, publicKey } = action.params;
            return nearApiTransactions.stake(new BN(stake) as any, nearApiUtils.PublicKey.from(publicKey));
        }
        case "AddKey": {
            const { publicKey, accessKey } = action.params;
            const getAccessKey = (permission: AddKeyPermission) => {
                if (permission === "FullAccess") {
                    return nearApiTransactions.fullAccessKey();
                }
                const { receiverId, methodNames = [] } = permission;
                const allowance = permission.allowance ? (new BN(permission.allowance) as any) : undefined;
                return nearApiTransactions.functionCallAccessKey(receiverId, methodNames, allowance as any);
            };
            return nearApiTransactions.addKey(nearApiUtils.PublicKey.from(publicKey), getAccessKey(accessKey.permission));
        }
        case "DeleteKey": {
            const { publicKey } = action.params;
            return nearApiTransactions.deleteKey(nearApiUtils.PublicKey.from(publicKey));
        }
        case "DeleteAccount": {
            const { beneficiaryId } = action.params;
            return nearApiTransactions.deleteAccount(beneficiaryId);
        }
        default:
            throw new Error(`NEAR Auth cannot sign ${action.type} actions`);
    }
};

export const connectorActionsToNearApiJsActions = (actions: ConnectorAction[]): any[] => {
    return actions.map((action) => createNearApiJsAction(action));
};
