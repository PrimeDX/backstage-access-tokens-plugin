export async function getToken(id, options) {
  const token = await options.db.getToken(id, { now: options.now() });
  if (!token) {
    throw createError('NOT_FOUND', 'Token not found');
  }

  return token;
}

function createError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
