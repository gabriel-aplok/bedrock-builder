export class GenerateError extends Error {
  readonly exitCode = 5;
  constructor(message: string) {
    super(message);
    this.name = "GenerateError";
  }
}
