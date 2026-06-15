const Joi = require('joi');

module.exports = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      const data = req[source] || {};
      const { value, error } = schema.validate(data, { abortEarly: false, allowUnknown: false, stripUnknown: true });
      if (error) {
        const errors = error.details.map(d => ({ path: d.path.join('.'), message: d.message }));
        return res.status(400).json({ errors });
      }
      req.validated = value;
      return next();
    } catch (err) {
      return next(err);
    }
  };
};
