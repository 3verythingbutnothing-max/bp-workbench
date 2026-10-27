export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}
export const conflict = () =>
  new AppError("This record changed since you opened it. Refresh and try again.", 409);
