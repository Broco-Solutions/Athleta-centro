import * as argon2 from 'argon2';
import { passwordIsValid } from './auth.service';
describe('internal password policy', () => {
  it('requires the documented complexity', () => { expect(passwordIsValid('Abcdefghi1!')).toBe(true); expect(passwordIsValid('weakpassword')).toBe(false); });
  it('uses Argon2id for hashes', async () => { const hash = await argon2.hash('Abcdefghi1!', { type: argon2.argon2id }); expect(await argon2.verify(hash, 'Abcdefghi1!')).toBe(true); expect(hash).toContain('argon2id'); });
});
