# PE-05B2 · Evidence pack for Mercado Pago Support

Sanitised. Contains no access tokens, passwords, usernames, verification codes,
personal data of the account owner, or any other credential.

All observations below are **historical**. Nothing was reproduced to build this
document, and no further calls will be made until Support answers.

## 1 · Context

| | |
|---|---|
| Country | Colombia |
| Site | **MCO** |
| Product | Mercado Pago **Subscriptions** (recurring payments) |
| Main endpoint | `POST /preapproval`, **without** `preapproval_plan_id` |
| Currency | COP |

## 2 · Seller — verified TEST SELLER

The application was created while logged in as a test seller. Its credentials
appear in the dashboard under *"Credenciales de producción"* with an `APP_USR-`
prefix, so the token shape is **not** a reliable indicator. We classify by
identity instead, from `GET /users/me`:

```
owner_is_test_user : true
site_id            : MCO
country_id         : CO
tags               : user_product_seller, test_user, normal
```

Before the cutover the same call returned `user_product_seller,
messages_as_seller, normal` — **without `test_user`** — so the change is
verified, not assumed.

## 3 · Buyer — TEST BUYER created in the dashboard

A test account for **Colombia / MCO** was created through the Test Accounts UI.

The dashboard exposes exactly:

- Country
- User ID
- Username
- Password
- Verification code

**It does not expose an email address.**

## 4 · The inconsistency we are reporting

1. The Test Accounts UI exposes **no payer email**.
2. `POST /preapproval` **requires** `payer_email`.
3. Other Mercado Pago documentation instructs integrations to use the test
   buyer account's email as `payer_email`.
4. `POST /users/test` **documents** an `email` field in its response — with
   `test@testuser.com` as the example — but the live API returned **no email**
   for the user it created.
5. `GET /users/{id}` for that test user returns
   `address, country_id, id, nickname, permalink, seller_reputation, site_id,
   status, user_type` — **no email field, under any name**.

So there is no documented, API-reachable way to obtain the value the API
requires.

## 5 · Observations (historical, not to be retried)

**Under the previous, REAL seller account (test credentials of a real account):**

| # | Request | Result |
|---|---|---|
| 1 | `POST /preapproval` · `payer_email = test@testuser.com` (the reference's own example) | `HTTP 400` — `Payer is associated with a different site` |
| 2 | `POST /preapproval` · addresses derived from the test user's nickname and ID | `HTTP 400` — `User bad request` |
| 3 | `POST /v1/customers` · `test_payer_[0-9]{1,10}@testuser.com` (the documented test pattern) | `HTTP 400` — `Error invalid domain user email` |

**Under the current, VERIFIED TEST SELLER (MCO):**

| # | Request | Result |
|---|---|---|
| 4 | `POST /v1/customers` · same documented pattern | `HTTP 401` — `access denied` |
| 5 | `POST /preapproval` · same documented pattern as `payer_email` | `HTTP 400` — `User bad request` |

In case 4 the preceding `GET /v1/customers/search` responded normally and
returned no results, so the `401` comes from the create call, not the search.

## 6 · Provider state

```
customers created   : 0
preapprovals created: 0   (PreApproval.search → total: 0)
payments            : 0
webhook events      : 0
```

Nothing was left half-created. This was verified by asking the API, not
inferred from the error codes.

## 7 · Questions for Support

**Q1 — the blocking one.** What exact `payer_email` must be used for a Mercado
Pago **TEST BUYER on site MCO**, when the Test Accounts dashboard exposes no
email and neither `POST /users/test` nor `GET /users/{id}` returns one?

**Q2.** Is `POST /v1/customers` intentionally unavailable to a verified MCO test
seller application? If it requires an additional capability, which one, and how
is it enabled for a test seller?

**Q3.** Does `POST /preapproval` support

```json
"auto_recurring": { "frequency": 12, "frequency_type": "months",
                    "currency_id": "COP" }
```

for an MCO subscription **without** `preapproval_plan_id`? We have not been able
to reach this validation: the payer is rejected first, so the recurrence has
never been evaluated. This is a **product-blocking** question for us — an annual
plan is a frozen requirement, and we will not simulate it with twelve monthly
charges.

**Q4.** For an authorised subscription, when `auto_recurring.transaction_amount`
is changed through `PUT /preapproval/{id}` on **MCO**, does the new amount

- apply only from the next cycle onward,
- trigger any immediate charge, or
- cause any provider-native proration?

We need the official behaviour, not an inference, because a future tax change
must reach the next charge without altering the contracted base price.
