interface ErrorPayload {
  error: {
    message: string;
    why?: string;
    fix?: string;
  };
}

export interface HttpErrorInput {
  message: string;
  status: number;
  why?: string;
  fix?: string;
}

export class HttpError extends Error {
  readonly status: number;
  readonly why?: string;
  readonly fix?: string;

  constructor(input: HttpErrorInput) {
    super(input.message);
    this.name = "HttpError";
    this.status = input.status;
    this.why = input.why;
    this.fix = input.fix;
  }

  toPayload(): ErrorPayload {
    return {
      error: {
        message: this.message,
        ...(this.why ? { why: this.why } : {}),
        ...(this.fix ? { fix: this.fix } : {}),
      },
    };
  }
}

export function createHttpError(input: HttpErrorInput): HttpError {
  return new HttpError(input);
}

export function errorResponse(input: HttpErrorInput): Response {
  return Response.json(new HttpError(input).toPayload(), {
    status: input.status,
  });
}

export function toErrorResponse(error: unknown): Response | null {
  if (!(error instanceof HttpError)) return null;
  return Response.json(error.toPayload(), { status: error.status });
}
