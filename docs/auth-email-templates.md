# Program Command auth email links

The confirmation page guards against mail scanners that open links without clicking buttons. It verifies the token only after the person selects **Continue to create password**. The page then opens the existing password form for both resets and invitations.

## Rollout order

1. Merge the confirmation page and have a maintainer run the manual **Deploy Pages** workflow. Confirm `https://sicxz.github.io/program-command/confirm-auth.html` loads and reports an incomplete link when opened without email parameters.
2. In Supabase project `ohnrhjxcjkrdtudpzjgn`, open **Authentication → Email Templates → Reset Password**. Set the subject to `Reset your Program Command password` and replace the message/body HTML with:

   ```html
   <h2>Reset your Program Command password</h2>
   <p>Open the page below, then select Continue to create a new password.</p>
   <p><a href="https://sicxz.github.io/program-command/confirm-auth.html?type=recovery&amp;token_hash={{ .TokenHash }}">Open password reset</a></p>
   <p>If you did not request this, ignore this email.</p>
   ```

3. Open **Authentication → Email Templates → Invite User**. Set the subject to `You're invited to Program Command` and replace the message/body HTML with:

   ```html
   <h2>You're invited to Program Command</h2>
   <p>Open the page below, then select Continue to accept your invitation and create a password.</p>
   <p><a href="https://sicxz.github.io/program-command/confirm-auth.html?type=invite&amp;token_hash={{ .TokenHash }}">Open invitation</a></p>
   ```

4. Request a fresh reset from the sign-in page. The email link should open the confirmation page without immediately using the token. Select **Continue to create password** and confirm the **Create your password** form appears. An old, already used link cannot be retested.

The email links use `{{ .TokenHash }}` instead of `{{ .ConfirmationURL }}` so opening the page alone does not verify the token. Keep the email provider's click tracking disabled. Do not change the Supabase templates before the confirmation page is live.
