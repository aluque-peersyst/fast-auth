import { createErrorHandlerDecorator } from "@shared/utils";
import { DomainError } from "../domain-error";

/**
 * Reads the properties a validation answer refused.
 * Nest's `ValidationPipe` starts each message with the property's name (`"name must be …"`).
 * @param error Any error.
 * @returns The refused properties, or `undefined` when the error is not a validation answer.
 */
function refusedProperties(error: any): string[] | undefined {
    const body = error instanceof Error ? (error as any).body : undefined;
    if (body?.statusCode !== 400 || !Array.isArray(body.message)) return undefined;
    const messages: string[] = body.message.filter((message: unknown) => typeof message === "string");
    return [...new Set(messages.map((message) => message.split(" ", 1)[0]))];
}

/**
 * Handle validation errors.
 * @param error The error to handle.
 * @param domainError The domain error to throw, with the refused properties as `data.fields`.
 */
function handleValidationError(error: any, domainError: string): void {
    const fields = refusedProperties(error);
    if (fields) throw new DomainError(domainError, "error", { fields });
    throw error;
}

/**
 * Decorator to handle a 400 whose body lists the refused properties' messages, as Nest's `ValidationPipe` answers.
 * Place it outside `@ApiErrors`, which only matches a single message.
 * @param domainError The domain error code to throw.
 */
export const ValidationErrors = createErrorHandlerDecorator(handleValidationError);
