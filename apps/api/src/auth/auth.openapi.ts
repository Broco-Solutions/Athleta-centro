export const credentialsRequestSchema = {
  type: 'object',
  required: ['email', 'password'],
  properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' } },
};

export const passwordChangeRequestSchema = {
  type: 'object',
  required: ['currentPassword', 'nextPassword'],
  properties: { currentPassword: { type: 'string', format: 'password' }, nextPassword: { type: 'string', format: 'password' } },
};
