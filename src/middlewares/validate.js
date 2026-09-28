const { fail } = require('../utils/apiResponse');

/**
 * Generic Joi-schema-based request validator.
 * `part` is which part of the request to validate: 'body' | 'query' | 'params'.
 */
function validate(schema, part = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[part], { abortEarly: false, stripUnknown: true });
    if (error) {
      return fail(
        res,
        400,
        'Validation failed',
        error.details.map((d) => d.message)
      );
    }
    req[part] = value;
    next();
  };
}

module.exports = { validate };
