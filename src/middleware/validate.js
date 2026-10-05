/**
 * Middleware factory for request validation using Zod schemas
 * @param {import("zod").ZodSchema} schema 
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const formattedErrors = result.error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));

      const err = new Error(
        `Validation failed: ${formattedErrors.map((e) => e.message).join("; ")}`
      );
      err.statusCode = 400;
      err.errors = formattedErrors;
      return next(err);
    }

    // Replace req.body with the sanitized and typed data from Zod
    req.body = result.data;
    next();
  };
}

module.exports = { validateBody };
