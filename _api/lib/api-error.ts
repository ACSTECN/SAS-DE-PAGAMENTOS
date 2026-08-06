export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function asyncHandler<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<unknown>,
) {
  return (...args: TArgs) => {
    const next = args[2] as (error?: unknown) => void;
    Promise.resolve(handler(...args)).catch(next);
  };
}
