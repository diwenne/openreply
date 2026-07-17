# Referral Program Plan

ManyChat Alternative will launch referrals as a manual founding-agency loop before automating billing credits.

## Founding Agency Offer

Target customer: agencies already managing Instagram campaigns for clients.

Offer:

- $49/month Agency plan during beta.
- Manual onboarding for up to 10 connected Instagram accounts.
- Setup help for the first 3 client campaigns.
- Priority feedback channel for templates, analytics, and reports.
- Optional founding agency badge on beta report pages.

The offer should drive early revenue and product learning without promising custom agency services forever.

## Referral Loop

Manual v1:

1. A founding agency refers another agency operator.
2. The referred agency signs up and launches at least one tracked campaign.
3. When the referred agency becomes a paid Agency customer, both sides get a manual account credit or service extension.

Automated v2:

1. Generate referral codes per workspace.
2. Attribute signup and first paid subscription to the referring workspace.
3. Apply account credits only after fraud checks pass.
4. Surface referral status inside settings.

## Fraud Controls

Billing credits should not be automatic until these controls exist:

- Require referred workspace to use a different email domain and Instagram account.
- Require first successful subscription payment before awarding credit.
- Delay credit until the refund and chargeback risk window is acceptable.
- Block self-referrals, duplicate accounts, disposable emails, and repeated payment method reuse.
- Cap monthly referral credits per workspace.
- Record referral attribution and credit decisions in auditable billing events.

## Future Implementation

Follow-up GitHub issue: [#26 P2: Implement referral billing credits](https://github.com/diwenne/manychat_alternative/issues/26).

Planned implementation pieces:

- `ReferralCode` and `ReferralAttribution` models.
- Signup attribution from `?ref=`.
- Settings page referral panel.
- Admin review path for suspicious referrals.
