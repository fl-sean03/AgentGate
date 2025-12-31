/**
 * Custom error types for the Gate Resolver module.
 */

/**
 * Error thrown when a profile file cannot be found.
 */
export class ProfileNotFoundError extends Error {
  readonly name = 'ProfileNotFoundError';
  readonly searchPaths: string[];

  constructor(searchPaths: string[]) {
    super(`Profile not found. Searched locations: ${searchPaths.join(', ')}`);
    this.searchPaths = searchPaths;
    Object.setPrototypeOf(this, ProfileNotFoundError.prototype);
  }
}

/**
 * Error thrown when a profile file cannot be parsed.
 */
export class ProfileParseError extends Error {
  readonly name = 'ProfileParseError';
  readonly filePath: string;
  readonly parseError: Error;

  constructor(filePath: string, parseError: Error) {
    super(`Failed to parse profile at ${filePath}: ${parseError.message}`);
    this.filePath = filePath;
    this.parseError = parseError;
    Object.setPrototypeOf(this, ProfileParseError.prototype);
  }
}

/**
 * Error thrown when a profile fails validation.
 */
export class ProfileValidationError extends Error {
  readonly name = 'ProfileValidationError';
  readonly filePath: string | null;
  readonly validationErrors: string[];

  constructor(filePath: string | null, validationErrors: string[]) {
    const location = filePath ? ` at ${filePath}` : '';
    super(`Profile validation failed${location}: ${validationErrors.join('; ')}`);
    this.filePath = filePath;
    this.validationErrors = validationErrors;
    Object.setPrototypeOf(this, ProfileValidationError.prototype);
  }
}
