import { HttpStatus } from "@nestjs/common";
import { AuthErrorBody, AuthErrorCode } from "../../auth/error/auth.error-codes";
import { DappErrorBody, DappErrorCode } from "../../dapp/error/dapp.error-codes";
import { SettingErrorBody, SettingErrorCode } from "../../setting/error/setting.error-codes";

// Define app error codes
enum AppErrorCode {
    RATE_LIMITED = "RATE_LIMITED",
    INTERNAL = "INTERNAL",
}

const AppErrorBody: Record<AppErrorCode, { statusCode: HttpStatus; message: string }> = {
    [AppErrorCode.RATE_LIMITED]: { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: AppErrorCode.RATE_LIMITED },
    [AppErrorCode.INTERNAL]: { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: AppErrorCode.INTERNAL },
};

export const ErrorCode = { ...AppErrorCode, ...AuthErrorCode, ...DappErrorCode, ...SettingErrorCode };
export type ErrorCodeType = AppErrorCode | AuthErrorCode | DappErrorCode | SettingErrorCode;

export const ErrorBody: { [code in ErrorCodeType]: { statusCode: HttpStatus; message: string } } = {
    ...AppErrorBody,
    ...AuthErrorBody,
    ...DappErrorBody,
    ...SettingErrorBody,
};
