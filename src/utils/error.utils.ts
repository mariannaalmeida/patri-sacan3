import { AppError, AppErrorCode, Result } from '../types/types';

export const Ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const Err = (error: AppError): Result<never> => ({ ok: false, error });

export function unknownToAppError(cause: unknown, code: AppErrorCode = 'UNKNOWN'): AppError {
  const message =
    cause instanceof Error ? cause.message : 'Ocorreu um erro inesperado. Tente novamente.';
  return { code, message, cause };
}

export async function handleServiceError<T>(
  fn: () => Promise<T>,
  code: AppErrorCode,
  context?: Record<string, unknown>
): Promise<Result<T>> {
  try {
    const value = await fn();
    return Ok(value);
  } catch (cause) {
    const error = unknownToAppError(cause, code);
    if (context) error.context = context;
    return Err(error);
  }
}
