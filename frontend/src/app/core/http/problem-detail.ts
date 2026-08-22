export interface ProblemDetail {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly errors?: Readonly<Record<string, string>>;
  readonly requestId?: string;
}

export interface ApiError {
  readonly status: number;
  readonly title: string;
  readonly detail: string;
  readonly fieldErrors: Readonly<Record<string, string>>;
  readonly requestId?: string;
}
