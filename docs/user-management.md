# User management

The Users page lets administrators list accounts, invite users by email, assign the `admin` or `participant` role, and remove access. Browser requests call the `admin-users` Supabase Edge Function. The function validates the signed-in caller against `user_profiles`, performs privileged Auth operations with its server-side service-role client, and keeps the older `editors` write list synchronized with the `admin` role. The service-role key is never sent to the browser.

## Deploy the Edge Function

Travis deploys the function from the project root:

```sh
brew install supabase/tap/supabase
supabase login
supabase functions deploy admin-users --project-ref ohnrhjxcjkrdtudpzjgn
```

The invitation redirect defaults to the live Program Command login page. To override it, optionally set:

```sh
supabase secrets set INVITE_REDIRECT_URL=... --project-ref ohnrhjxcjkrdtudpzjgn
```

To confirm the deployed function works, open **Users** while signed in as an administrator. The table should list the accounts with access.
